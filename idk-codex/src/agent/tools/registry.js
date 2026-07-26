/**
 * MAX 2.0 — Tool Registry
 *
 * Tools that the LLM can call during a ReAct loop. Each tool:
 *   - Has a name, description, and parameter spec
 *   - Executes synchronously and returns a result string
 *   - Is designed for LLM consumption (concise, bounded output)
 *
 * The tool protocol is text-based (XML-like tags) so it works with ANY model,
 * not just ones that support function calling. Inspired by SWE-agent and Aider.
 *
 * Tools available:
 *   - bash         Run a shell command (with timeout, sandboxed)
 *   - read_file    Read a file (with line numbers, max 200 lines)
 *   - write_file   Create or overwrite a file
 *   - edit_file    Search/replace in a file (Aider-style)
 *   - list_files   List files in a directory
 *   - search       grep/find across the workspace
 *   - web_search   Search the web (if available)
 *   - web_fetch    Fetch a URL and extract text
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';
import { backupFile, validateAndRevert } from '../guardrails.js';
import { browserTools } from './browser-tool.js';
import { memoryTools } from './memory-tool.js';

const SANDBOX = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
const MAX_OUTPUT_CHARS = 8000; // Truncate tool output to keep context manageable
const BASH_TIMEOUT_MS = 30000; // 30 second timeout for bash commands

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const TOOLS = {
  bash: {
    name: 'bash',
    description: 'Run a shell command in the sandbox workspace. Returns stdout and stderr. Use for: running tests, installing packages, building code, git operations, checking file contents with cat/head/tail, etc. Output is truncated to 8000 chars.',
    params: { command: 'string (required) — the shell command to run' },
    execute: async (args) => {
      const command = args.command;
      if (!command) return 'Error: command is required';

      try {
        logger.info('TOOL:bash', { command: command.substring(0, 100) });

        // Run with timeout, capture stdout+stderr
        const result = execSync(command, {
          cwd: SANDBOX,
          timeout: BASH_TIMEOUT_MS,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, TERM: 'dumb' },
          maxBuffer: 1024 * 1024 // 1MB
        });

        let output = result || '(no output)';
        if (output.length > MAX_OUTPUT_CHARS) {
          output = output.substring(0, MAX_OUTPUT_CHARS) + '\n... (output truncated)';
        }
        return output;
      } catch (err) {
        // Command failed — return stderr so the agent can see the error
        let output = '';
        if (err.stdout) output += err.stdout;
        if (err.stderr) output += '\n' + err.stderr;
        if (err.killed && err.signal === 'SIGTERM') {
          output += '\n(command timed out after 30s)';
        }
        output = output || ('Error: ' + err.message);
        if (output.length > MAX_OUTPUT_CHARS) {
          output = output.substring(0, MAX_OUTPUT_CHARS) + '\n... (output truncated)';
        }
        return output.trim();
      }
    }
  },

  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file. Returns the file with line numbers (1-based). Max 200 lines shown — use offset/limit for large files.',
    params: {
      path: 'string (required) — path to the file (relative to workspace)',
      offset: 'number (optional) — starting line number, default 1',
      limit: 'number (optional) — max lines to read, default 200'
    },
    execute: async (args) => {
      const filePath = args.path;
      if (!filePath) return 'Error: path is required';

      const offset = parseInt(args.offset || '1', 10);
      const limit = parseInt(args.limit || '200', 10);

      const fullPath = path.resolve(SANDBOX, filePath);

      // Security: must be inside sandbox
      if (!fullPath.startsWith(path.resolve(SANDBOX))) {
        return 'Error: path is outside the sandbox workspace';
      }

      try {
        if (!fs.existsSync(fullPath)) {
          return `Error: file not found: ${filePath}`;
        }

        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        const start = Math.max(0, offset - 1);
        const end = Math.min(lines.length, start + limit);
        const slice = lines.slice(start, end);

        // Add line numbers
        const numbered = slice.map((line, i) => {
          const lineNum = start + i + 1;
          return `${String(lineNum).padStart(4)}: ${line}`;
        }).join('\n');

        let result = numbered;
        if (end < lines.length) {
          result += `\n... (${lines.length - end} more lines, use offset=${end + 1} to continue)`;
        }
        return result || '(empty file)';
      } catch (err) {
        return `Error reading file: ${err.message}`;
      }
    }
  },

  write_file: {
    name: 'write_file',
    description: 'Create or overwrite a file with the given content. Creates parent directories if needed. Write RAW code — do NOT HTML-escape (use < not &lt;).',
    params: {
      path: 'string (required) — path to the file (relative to workspace)',
      content: 'string (required) — the full file content (raw, not HTML-escaped)'
    },
    execute: async (args) => {
      const filePath = args.path;
      let content = args.content;

      if (!filePath) return 'Error: path is required';
      if (content === undefined || content === null) return 'Error: content is required';

      // Decode HTML entities that LLMs sometimes add
      content = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');

      const fullPath = path.resolve(SANDBOX, filePath);
      if (!fullPath.startsWith(path.resolve(SANDBOX))) {
        return 'Error: path is outside the sandbox workspace';
      }

      try {
        // Create parent directories
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });

        // Backup existing file before overwriting (for guardrail revert)
        if (fs.existsSync(fullPath)) {
          backupFile(filePath);
        }

        fs.writeFileSync(fullPath, content, 'utf-8');
        const size = Buffer.byteLength(content, 'utf-8');
        logger.info('TOOL:write_file', { path: filePath, size });

        // Guardrail: validate the file after writing
        const validation = validateAndRevert(filePath);
        if (!validation.valid && validation.reverted) {
          return `Warning: ${validation.error}`;
        }

        return `Successfully wrote ${size} bytes to ${filePath}`;
      } catch (err) {
        return `Error writing file: ${err.message}`;
      }
    }
  },

  edit_file: {
    name: 'edit_file',
    description: 'Edit a file using search/replace. Finds old_text in the file and replaces it with new_text. The old_text must match exactly (including whitespace). Use this for precise edits without rewriting the whole file.',
    params: {
      path: 'string (required) — path to the file',
      old_text: 'string (required) — the exact text to find',
      new_text: 'string (required) — the text to replace it with'
    },
    execute: async (args) => {
      const filePath = args.path;
      let oldText = args.old_text;
      let newText = args.new_text;

      if (!filePath) return 'Error: path is required';
      if (oldText === undefined) return 'Error: old_text is required';
      if (newText === undefined) return 'Error: new_text is required';

      // Decode HTML entities that LLMs sometimes add
      const decodeEntities = (str) => str
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
      oldText = decodeEntities(oldText);
      newText = decodeEntities(newText);

      const fullPath = path.resolve(SANDBOX, filePath);
      if (!fullPath.startsWith(path.resolve(SANDBOX))) {
        return 'Error: path is outside the sandbox workspace';
      }

      try {
        if (!fs.existsSync(fullPath)) {
          return `Error: file not found: ${filePath}`;
        }

        const content = fs.readFileSync(fullPath, 'utf-8');

        // Check if old_text exists
        if (!content.includes(oldText)) {
          // Try to find a close match to help the LLM
          const lines = content.split('\n');
          const oldLines = oldText.split('\n');
          let foundSimilar = false;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === oldLines[0].trim()) {
              foundSimilar = true;
              break;
            }
          }
          if (foundSimilar) {
            return `Error: old_text not found exactly. The first line matches but the full text doesn't. Check whitespace and exact characters.`;
          }
          return `Error: old_text not found in file. Make sure the text matches exactly (including whitespace and indentation).`;
        }

        // Check for multiple matches
        const matchCount = content.split(oldText).length - 1;
        if (matchCount > 1) {
          return `Error: old_text found ${matchCount} times in the file. Please provide more context to make the match unique.`;
        }

        // Replace
        const newContent = content.replace(oldText, newText);

        // Backup before writing (for guardrail revert)
        backupFile(filePath);

        fs.writeFileSync(fullPath, newContent, 'utf-8');

        logger.info('TOOL:edit_file', { path: filePath });

        // Guardrail: validate the file after editing
        const validation = validateAndRevert(filePath);
        if (!validation.valid && validation.reverted) {
          return `Warning: ${validation.error}`;
        }

        return `Successfully edited ${filePath} (replaced ${oldText.split('\n').length} line(s))`;
      } catch (err) {
        return `Error editing file: ${err.message}`;
      }
    }
  },

  list_files: {
    name: 'list_files',
    description: 'List files in a directory. Returns file names with [DIR] or [FILE] markers. Max 100 entries.',
    params: {
      path: 'string (optional) — directory path, default is workspace root',
      recursive: 'boolean (optional) — if true, list recursively (max 3 levels)'
    },
    execute: async (args) => {
      const dirPath = args.path || '.';
      const recursive = args.recursive === 'true' || args.recursive === true;

      const fullPath = path.resolve(SANDBOX, dirPath);
      if (!fullPath.startsWith(path.resolve(SANDBOX))) {
        return 'Error: path is outside the sandbox workspace';
      }

      try {
        if (!fs.existsSync(fullPath)) {
          return `Error: directory not found: ${dirPath}`;
        }

        const entries = [];
        const maxEntries = 100;

        function listDir(dir, prefix, depth) {
          if (entries.length >= maxEntries) return;
          if (depth > 3) return;

          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            if (entries.length >= maxEntries) break;
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;

            const relPath = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.isDirectory()) {
              entries.push(`[DIR]  ${relPath}/`);
              if (recursive) {
                listDir(path.join(dir, item.name), relPath, depth + 1);
              }
            } else {
              entries.push(`[FILE] ${relPath}`);
            }
          }
        }

        listDir(fullPath, '', 0);

        if (entries.length === 0) {
          return '(empty directory)';
        }

        let result = entries.join('\n');
        if (entries.length >= maxEntries) {
          result += '\n... (truncated at 100 entries)';
        }
        return result;
      } catch (err) {
        return `Error listing files: ${err.message}`;
      }
    }
  },

  search: {
    name: 'search',
    description: 'Search for text in files (grep) or find files by name (glob). Returns matching lines with file:line:content format.',
    params: {
      query: 'string (required) — text to search for (or glob pattern with pattern:)',
      path: 'string (optional) — directory to search in, default is workspace root',
      max_results: 'number (optional) — max results, default 30'
    },
    execute: async (args) => {
      const query = args.query;
      if (!query) return 'Error: query is required';

      const searchPath = args.path || '.';
      const maxResults = parseInt(args.max_results || '30', 10);

      const fullPath = path.resolve(SANDBOX, searchPath);
      if (!fullPath.startsWith(path.resolve(SANDBOX))) {
        return 'Error: path is outside the sandbox workspace';
      }

      try {
        let command;
        if (query.startsWith('pattern:')) {
          // Glob pattern — use find
          const pattern = query.replace('pattern:', '');
          command = `find "${fullPath}" -name "${pattern}" -not -path '*/node_modules/*' -not -path '*/.git/*' | head -${maxResults}`;
        } else {
          // Text search — use grep -rn
          command = `grep -rn --include='*' --exclude-dir=node_modules --exclude-dir=.git "${query.replace(/"/g, '\\"')}" "${fullPath}" 2>/dev/null | head -${maxResults}`;
        }

        const result = execSync(command, {
          encoding: 'utf-8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        if (!result || result.trim() === '') {
          return '(no matches found)';
        }

        // Make paths relative to sandbox
        const sandboxPath = path.resolve(SANDBOX);
        const relativeResult = result.split('\n').map(line => {
          return line.replace(sandboxPath + '/', '');
        }).join('\n');

        return relativeResult.trim();
      } catch (err) {
        if (err.status === 1) {
          return '(no matches found)';
        }
        return `Error searching: ${err.message}`;
      }
    }
  },

  web_search: {
    name: 'web_search',
    description: 'Search the web for information. Returns search results with titles, URLs, and snippets. Use for looking up documentation, APIs, or current information.',
    params: {
      query: 'string (required) — search query'
    },
    execute: async (args) => {
      const query = args.query;
      if (!query) return 'Error: query is required';

      try {
        // Use a simple web search via DuckDuckGo HTML (no API key needed)
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (!response.ok) {
          return `Error: web search failed (${response.status})`;
        }

        const html = await response.text();

        // Extract results (simple parsing)
        const results = [];
        const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>(.*?)<\/a>/g;
        let match;
        let count = 0;
        while ((match = resultRegex.exec(html)) !== null && count < 5) {
          const url = match[1].replace(/&amp;/g, '&');
          const title = match[2].replace(/<[^>]+>/g, '').trim();
          const snippet = match[3].replace(/<[^>]+>/g, '').trim();
          results.push(`${count + 1}. ${title}\n   ${url}\n   ${snippet.substring(0, 200)}`);
          count++;
        }

        if (results.length === 0) {
          return '(no search results found)';
        }

        return results.join('\n\n');
      } catch (err) {
        return `Error: web search failed: ${err.message}`;
      }
    }
  },

  web_fetch: {
    name: 'web_fetch',
    description: 'Fetch a URL and return the text content (HTML stripped to text). Max 5000 chars. Use for reading documentation pages or API responses.',
    params: {
      url: 'string (required) — the URL to fetch'
    },
    execute: async (args) => {
      const url = args.url;
      if (!url) return 'Error: url is required';

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
          return `Error: fetch failed (${response.status} ${response.statusText})`;
        }

        const contentType = response.headers.get('content-type') || '';

        let text;
        if (contentType.includes('application/json')) {
          const json = await response.json();
          text = JSON.stringify(json, null, 2);
        } else {
          text = await response.text();
          // Strip HTML tags
          text = text
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }

        if (text.length > 5000) {
          text = text.substring(0, 5000) + '\n... (truncated)';
        }

        return text || '(empty response)';
      } catch (err) {
        return `Error: fetch failed: ${err.message}`;
      }
    }
  }
};

// Merge browser tools into TOOLS
for (const [name, tool] of Object.entries(browserTools)) {
  TOOLS[name] = tool;
}

// Merge memory tools into TOOLS
for (const [name, tool] of Object.entries(memoryTools)) {
  TOOLS[name] = tool;
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Execute a tool by name with the given arguments.
 * @param {string} toolName - name of the tool
 * @param {Object} args - arguments object
 * @returns {Promise<string>} result string
 */
export async function executeTool(toolName, args) {
  const tool = TOOLS[toolName];
  if (!tool) {
    return `Error: unknown tool "${toolName}". Available tools: ${Object.keys(TOOLS).join(', ')}`;
  }

  try {
    const result = await tool.execute(args || {});
    return result;
  } catch (err) {
    logger.error('TOOL_ERROR', { tool: toolName, error: err.message });
    return `Error executing ${toolName}: ${err.message}`;
  }
}

/**
 * Get the tool descriptions for the system prompt.
 * @returns {string}
 */
export function getToolDescriptions() {
  return Object.values(TOOLS).map(tool => {
    const params = Object.entries(tool.params)
      .map(([name, desc]) => `    - ${name}: ${desc}`)
      .join('\n');
    return `<tool name="${tool.name}">\n  Description: ${tool.description}\n  Parameters:\n${params}\n</tool>`;
  }).join('\n\n');
}

/**
 * Get list of available tool names.
 * @returns {string[]}
 */
export function getToolNames() {
  return Object.keys(TOOLS);
}

/**
 * Build the tool registry (compatibility export for old react-loop.js).
 * Returns the TOOLS object in the format the old code expects.
 */
export function buildToolRegistry() {
  return TOOLS;
}

export default {
  TOOLS,
  executeTool,
  getToolDescriptions,
  getToolNames,
  buildToolRegistry
};
