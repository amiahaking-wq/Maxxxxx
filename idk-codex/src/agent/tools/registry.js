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

  web_fetch: {
    name: 'web_fetch',
    description: 'Fetch a URL and return the text content (HTML stripped to text, readability-optimized). Max 8000 chars. Use for reading documentation pages, articles, or API responses after web_search.',
    params: {
      url: 'string (required) — the URL to fetch'
    },
    execute: async (args) => {
      const url = args.url;
      if (!url) return 'Error: url is required';

      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
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
          // ===== READABILITY-EXTRACTION (Feature #17) =====
          text = extractReadable(text, url);
        }

        if (text.length > 8000) {
          text = text.substring(0, 8000) + '\n... (truncated)';
        }

        return text || '(empty response)';
      } catch (err) {
        return `Error: fetch failed: ${err.message}`;
      }
    }
  },

  // ========================================================================
  // WEB SEARCH — search the web using Google News RSS + DuckDuckGo (free, no API key)
  // Returns results with explicit [1], [2] citation markers so the agent can
  // cite sources in its final answer.
  // ========================================================================
  web_search: {
    name: 'web_search',
    description: 'Search the web for current information. Returns titles, URLs, and snippets. Use this when the user asks to search, look up, find news, or anything needing current data. ALWAYS use this FIRST for web questions — do not write code or files when asked to search. ALWAYS cite sources in your final answer using [1], [2] etc.',
    params: {
      query: 'string (required) — what to search for'
    },
    execute: async (args) => {
      const query = args.query;
      if (!query) return 'Error: query is required';

      try {
        logger.info('TOOL:web_search', { query: query.substring(0, 100) });
        const results = await performWebSearch(query);

        if (results.length === 0) {
          // AUTO-RETRY: try a simplified query (Feature #8 — multi-step search)
          const simplified = simplifyQuery(query);
          if (simplified !== query) {
            logger.info('web_search retry with simplified query', { original: query, simplified });
            const retryResults = await performWebSearch(simplified);
            if (retryResults.length > 0) {
              return formatSearchResults(simplified, retryResults) +
                '\n\n(Note: original query returned no results; tried simplified query.)';
            }
          }
          return `No search results found for: "${query}". Try rephrasing your search.`;
        }

        return formatSearchResults(query, results);
      } catch (err) {
        logger.error('web_search failed', { error: err.message });
        return `Error: web search failed: ${err.message}`;
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
// WEB SEARCH HELPERS — Google News RSS + DuckDuckGo, with auto-retry
// ============================================================================

/**
 * Simplify a search query for the retry attempt.
 * Removes filler words and shortens the query.
 */
function simplifyQuery(query) {
  return query
    .replace(/\b(please|can you|could you|would you|i want to|i need to|find me|search for|look up|google)\b/gi, '')
    .replace(/\b(today|now|current|latest|recent)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

/**
 * Perform a web search using multiple strategies:
 *   1. Google News RSS (always works, no rate limit) — for news queries
 *   2. DuckDuckGo Lite — for general queries
 *   3. Google News RSS as fallback — for any query
 * Returns array of { title, url, snippet, source }.
 */
async function performWebSearch(query) {
  const isNewsQuery = /\b(news|today|latest|current|happening|breaking)\b/i.test(query);
  const searchQuery = isNewsQuery ? query + ' news' : query;

  // ===== STRATEGY 1: Google News RSS (for news queries) =====
  if (isNewsQuery) {
    try {
      const rssUrl = 'https://news.google.com/rss/search?q=' + encodeURIComponent(searchQuery) + '&hl=en-US&gl=US&ceid=US:en';
      const rssResponse = await fetch(rssUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MAX-Agent/2.0)' }
      });
      if (rssResponse.ok) {
        const xml = await rssResponse.text();
        const results = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        while ((match = itemRegex.exec(xml)) !== null && results.length < 8) {
          const item = match[1];
          const title = item.match(/<title>(.*?)<\/title>/);
          const link = item.match(/<link>(.*?)<\/link>/);
          const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/);
          const source = item.match(/<source[^>]*>(.*?)<\/source>/);
          if (title) {
            results.push({
              title: title[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'"),
              url: link ? link[1] : '',
              snippet: (source ? source[1] + ' — ' : '') + (pubDate ? pubDate[1] : ''),
              source: source ? source[1] : 'Google News',
              date: pubDate ? pubDate[1] : ''
            });
          }
        }
        if (results.length > 0) return results;
      }
    } catch (e) {
      logger.warn('Google News RSS failed', { error: e.message });
    }
  }

  // ===== STRATEGY 2: DuckDuckGo Lite =====
  try {
    const ddgUrl = 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(searchQuery);
    const ddgResponse = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (ddgResponse.ok) {
      const html = await ddgResponse.text();
      const results = [];
      const linkRegex = /<a[^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs;
      let match;
      while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
        let href = match[1];
        const uddg = href.match(/uddg=([^&]+)/);
        if (uddg) href = decodeURIComponent(uddg[1]);
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        if (title.length > 5 && href.startsWith('http')) {
          results.push({ title, url: href, snippet: '', source: 'DuckDuckGo' });
        }
      }
      if (results.length > 0) return results;
    }
  } catch (e) {
    logger.warn('DuckDuckGo search failed', { error: e.message });
  }

  // ===== STRATEGY 3: Google News RSS as fallback for ALL queries =====
  try {
    const rssUrl = 'https://news.google.com/rss/search?q=' + encodeURIComponent(searchQuery) + '&hl=en-US&gl=US&ceid=US:en';
    const rssResponse = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MAX-Agent/2.0)' }
    });
    if (rssResponse.ok) {
      const xml = await rssResponse.text();
      const results = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null && results.length < 8) {
        const item = match[1];
        const title = item.match(/<title>(.*?)<\/title>/);
        const link = item.match(/<link>(.*?)<\/link>/);
        if (title) {
          results.push({
            title: title[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'"),
            url: link ? link[1] : '',
            snippet: '',
            source: 'Google News'
          });
        }
      }
      if (results.length > 0) return results;
    }
  } catch (e) {
    logger.warn('Google News fallback failed', { error: e.message });
  }

  return [];
}

/**
 * Format search results with explicit [1], [2] citation markers.
 * Tells the agent to cite sources in its final answer.
 */
function formatSearchResults(query, results) {
  let output = `Search results for "${query}" (${results.length} found):\n\n`;
  output += results.map((r, i) =>
    `[${i + 1}] ${r.title}\n` +
    `    Source: ${r.source || 'web'}${r.date ? ' — ' + r.date : ''}\n` +
    `    URL: ${r.url}\n` +
    (r.snippet ? `    ${r.snippet.substring(0, 250)}` : '')
  ).join('\n\n');

  output += '\n\nIMPORTANT: When you respond, cite sources using [1], [2], etc. and include the URLs.';
  return output;
}

/**
 * Readability extraction — pulls main article text from HTML.
 * Removes scripts, styles, nav, footer, ads. Extracts title, byline, content.
 * This is a simplified version of Mozilla's Readability algorithm.
 */
function extractReadable(html, sourceUrl) {
  try {
    // Remove scripts, styles, and other non-content tags
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<form[\s\S]*?<\/form>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

    // Extract title
    const titleMatch = cleaned.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Try to find article body — common patterns
    const articleMatch =
      cleaned.match(/<article[\s\S]*?<\/article>/i) ||
      cleaned.match(/<main[\s\S]*?<\/main>/i) ||
      cleaned.match(/<div[^>]*class="[^"]*(?:content|article|post|entry|story|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const body = articleMatch ? articleMatch[0] : cleaned;

    // Convert to text with paragraph breaks
    const text = body
      .replace(/<\/?(p|div|section|article|h[1-6]|li|ul|ol|blockquote|pre|br)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ') // Strip remaining tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    // If the result is too short, fall back to full page text
    if (text.length < 200) {
      const fallback = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return `Title: ${title}\nURL: ${sourceUrl}\n\n${fallback.substring(0, 8000)}`;
    }

    return `Title: ${title}\nURL: ${sourceUrl}\n\n${text.substring(0, 8000)}`;
  } catch (e) {
    // Fallback: simple tag strip
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000);
  }
}

// ============================================================================
// CREDENTIAL TOOLS (Stage 6E) — wired dynamically because they need userId
// ============================================================================
// These are added to the tool list at execution time. The executeTool()
// function passes userId through to credential tools via a context object.
// See react-loop-v2.js for the userId passing logic.

TOOLS.credential_save = {
  name: 'credential_save',
  description: 'Save credentials (username/password/API key) securely in the encrypted vault for future use. Passwords are NEVER stored in plain text, memory, or files — only in the encrypted vault.',
  params: {
    service_name: 'string (required) — name of the service, e.g. "jumia", "gmail", "paystack"',
    username: 'string (optional) — username or email',
    password: 'string (optional) — password (will be encrypted)',
    api_key: 'string (optional) — API key (will be encrypted)',
    notes: 'string (optional) — any notes about these credentials'
  },
  execute: async (args, ctx = {}) => {
    const { credentialVault } = await import('../../security/credential-vault.js');
    const userId = ctx.userId || 'default-user';
    if (!args.service_name) return 'Error: service_name is required';
    return credentialVault.save(userId, args.service_name, {
      username: args.username,
      password: args.password,
      apiKey: args.api_key,
      notes: args.notes
    });
  }
};

TOOLS.credential_get = {
  name: 'credential_get',
  description: 'Retrieve saved credentials for a service to use for login or API calls. CRITICAL: Never include the password in your response to the user — only use it internally for browser login or API calls.',
  params: {
    service_name: 'string (required) — name of the service to retrieve credentials for'
  },
  execute: async (args, ctx = {}) => {
    const { credentialVault } = await import('../../security/credential-vault.js');
    const userId = ctx.userId || 'default-user';
    if (!args.service_name) return 'Error: service_name is required';
    const creds = credentialVault.get(userId, args.service_name);
    if (!creds) return `No credentials saved for: ${args.service_name}. Use credential_save to add them first.`;
    // Return credentials for the agent to use — but the agent is instructed
    // in the system prompt to never expose passwords in responses.
    return JSON.stringify({
      service_name: creds.service_name,
      username: creds.username,
      password: creds.password,
      api_key: creds.apiKey,
      notes: creds.notes
    });
  }
};

TOOLS.credential_list = {
  name: 'credential_list',
  description: 'List all services for which credentials are saved. Does NOT return passwords — only service names.',
  params: {},
  execute: async (args, ctx = {}) => {
    const { credentialVault } = await import('../../security/credential-vault.js');
    const userId = ctx.userId || 'default-user';
    const list = credentialVault.list(userId);
    if (list.length === 0) return 'No credentials saved. Use credential_save to add some.';
    return list.map(c =>
      `- ${c.service_name} (username: ${c.username || 'none'}, password: ${c.password_status}, api_key: ${c.api_key_status})`
    ).join('\n');
  }
};

TOOLS.credential_delete = {
  name: 'credential_delete',
  description: 'Delete saved credentials for a service.',
  params: {
    service_name: 'string (required) — name of the service to delete'
  },
  execute: async (args, ctx = {}) => {
    const { credentialVault } = await import('../../security/credential-vault.js');
    const userId = ctx.userId || 'default-user';
    if (!args.service_name) return 'Error: service_name is required';
    return credentialVault.delete(userId, args.service_name);
  }
};

// ============================================================================
// KNOWLEDGE BASE TOOLS (Stage 7E) — RAG with Supabase pgvector
// ============================================================================

TOOLS.knowledge_add = {
  name: 'knowledge_add',
  description: 'Add a document, policy, FAQ, product catalog, or any information to the knowledge base so MAX can remember and use it forever. The content is chunked, embedded, and stored in Supabase pgvector for semantic search.',
  params: {
    title: 'string (required) — short descriptive title',
    content: 'string (required) — full content to save (will be auto-chunked if long)',
    type: 'string (optional) — one of: policy, faq, product_catalog, customer_data, procedure, document',
    source: 'string (optional) — where this came from (e.g. "user upload", "website")'
  },
  execute: async (args, ctx = {}) => {
    try {
      const { knowledgeStore } = await import('../../rag/knowledge-store.js');
      const userId = ctx.userId || 'default-user';
      if (!args.title || !args.content) return 'Error: title and content are required';
      return await knowledgeStore.addDocument(userId, {
        title: args.title,
        content: args.content,
        type: args.type,
        source: args.source
      });
    } catch (e) {
      // RAG not configured (no Supabase pgvector or transformers model failed)
      return `Knowledge base not available: ${e.message}. Falling back to memory_save.`;
    }
  }
};

TOOLS.knowledge_search = {
  name: 'knowledge_search',
  description: 'Search the knowledge base for relevant information. Use this before answering questions about policies, products, or anything the user has told you to remember.',
  params: {
    query: 'string (required) — what to search for'
  },
  execute: async (args, ctx = {}) => {
    try {
      const { knowledgeStore } = await import('../../rag/knowledge-store.js');
      const userId = ctx.userId || 'default-user';
      if (!args.query) return 'Error: query is required';
      const results = await knowledgeStore.search(userId, args.query);
      return knowledgeStore.formatAsContext(results) || 'No relevant knowledge found.';
    } catch (e) {
      return `Knowledge search failed: ${e.message}`;
    }
  }
};

TOOLS.knowledge_list = {
  name: 'knowledge_list',
  description: 'List all documents in the knowledge base.',
  params: {},
  execute: async (args, ctx = {}) => {
    try {
      const { knowledgeStore } = await import('../../rag/knowledge-store.js');
      const userId = ctx.userId || 'default-user';
      const docs = await knowledgeStore.list(userId);
      if (!docs.length) return 'Knowledge base is empty. Use knowledge_add to add documents.';
      return docs.map(d =>
        `- [${d.content_type || 'document'}] ${d.title} (added ${d.created_at ? String(d.created_at).split('T')[0] : 'unknown'})`
      ).join('\n');
    } catch (e) {
      return `Knowledge list failed: ${e.message}`;
    }
  }
};

// ============================================================================
// UPLOADED FILE READER — lets the agent read files the user uploaded
// ============================================================================

TOOLS.read_upload = {
  name: 'read_upload',
  description: 'Read a file that the user uploaded. The user message will tell you which files they uploaded (by name). Use this tool to read the content of any uploaded file (text, code, CSV, JSON, etc.). The filename should match what the user told you they uploaded.',
  params: {
    filename: 'string (required) — the name of the uploaded file to read'
  },
  execute: async (args, ctx = {}) => {
    const filename = args.filename;
    if (!filename) return 'Error: filename is required';

    const uploadsDir = path.resolve(SANDBOX, 'uploads');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
    const fullPath = path.join(uploadsDir, safeName);

    if (!fs.existsSync(fullPath)) {
      // Try to find it case-insensitively
      try {
        const entries = fs.readdirSync(uploadsDir);
        const match = entries.find(e => e.toLowerCase() === safeName.toLowerCase());
        if (match) {
          return await readUploadFileSafe(path.join(uploadsDir, match));
        }
      } catch (e) {}
      return `Error: uploaded file "${filename}" not found. Available files: ${listUploads().join(', ') || 'none'}`;
    }

    return await readUploadFileSafe(fullPath);
  }
};

function listUploads() {
  // Lazy-load UPLOADS_DIR to avoid circular import at module load
  try {
    const uploadsDir = path.resolve(SANDBOX, 'uploads');
    return fs.readdirSync(uploadsDir).filter(f => !f.startsWith('.'));
  } catch (e) {
    return [];
  }
}

async function readUploadFileSafe(fullPath) {
  const filename = path.basename(fullPath);
  const stat = fs.statSync(fullPath);

  if (stat.size > 20 * 1024 * 1024) {
    return `File "${filename}" is too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max readable size is 20MB.`;
  }

  // Inline checks to avoid circular import
  const ext = path.extname(filename).toLowerCase();
  const textExts = new Set([
    '.txt', '.md', '.markdown', '.log', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
    '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.cs', '.php', '.swift',
    '.kt', '.lua', '.pl', '.html', '.htm', '.css', '.scss', '.json', '.yaml', '.yml',
    '.toml', '.ini', '.cfg', '.conf', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
    '.sql', '.graphql', '.xml', '.svg', '.csv', '.tsv', '.env', '.vue', '.svelte', '.astro'
  ]);
  const isText = textExts.has(ext) || ['dockerfile', 'makefile', 'gemfile', 'rakefile', 'license', 'readme'].includes(filename.toLowerCase());
  const isImage = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(filename);
  const isPdf = ext === '.pdf';

  if (isText) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const truncated = content.length > 50000
      ? content.substring(0, 50000) + `\n... (truncated, ${content.length - 50000} more chars)`
      : content;
    return `=== Uploaded file: ${filename} (${stat.size} bytes) ===\n\n${truncated}`;
  }

  if (isImage) {
    // Return base64 for vision-capable LLMs
    const buffer = fs.readFileSync(fullPath);
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
    const mime = mimeMap[ext.slice(1)] || 'image/png';
    const base64 = buffer.toString('base64');
    return `data:${mime};base64,${base64}`;
  }

  if (isPdf) {
    // Try to extract text from PDF using pdftotext (if available)
    try {
      const result = execSync(`pdftotext "${fullPath}" - 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      if (result && result.trim().length > 0) {
        return `=== PDF: ${filename} (extracted text) ===\n\n${result.substring(0, 50000)}`;
      }
    } catch (e) {
      // pdftotext not available
    }
    return `PDF file "${filename}" uploaded but text extraction is not available. Tell the user to copy-paste the relevant content.`;
  }

  // Binary file we can't read as text
  return `Binary file "${filename}" uploaded (${stat.size} bytes, type unknown). I cannot read binary files directly. If this is a code/text file, ask the user to rename it with a proper extension.`;
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
export async function executeTool(toolName, args, ctx = {}) {
  // 1. Try the built-in TOOLS registry first
  const tool = TOOLS[toolName];
  if (tool) {
    try {
      // Pass ctx (which contains userId) to tools that accept it
      const result = await tool.execute(args || {}, ctx);
      return result;
    } catch (err) {
      logger.error('TOOL_ERROR', { tool: toolName, error: err.message });
      return `Error executing ${toolName}: ${err.message}`;
    }
  }

  // 2. Try connector tools (github_*, supabase_*, gmail_*, calendar_*, drive_*)
  try {
    const { getAllConnectorTools } = await import('../connectors.js');
    const connectorTools = getAllConnectorTools();
    const connectorTool = connectorTools.find(t => t.name === toolName);
    if (connectorTool) {
      logger.info('CONNECTOR_TOOL_CALL', {
        tool: toolName,
        args: JSON.stringify(args).substring(0, 300)
      });
      const result = await connectorTool.execute(args || {});
      return typeof result === 'string' ? result : JSON.stringify(result);
    }
  } catch (e) {
    logger.warn('Connector tool dispatch failed', { tool: toolName, error: e.message });
  }

  // 3. Try sandboxed code execution
  if (toolName === 'run_code') {
    try {
      const { executeSandboxed } = await import('../../api/routes/sandbox.js');
      const result = await executeSandboxed(args.code, args.language || 'javascript', {
        timeoutMs: parseInt(args.timeoutMs || '10000', 10),
        allowNetwork: args.allowNetwork === true || args.allowNetwork === 'true'
      });
      return `Exit code: ${result.exitCode}${result.timedOut ? ' (timed out)' : ''}\nDuration: ${result.durationMs}ms\n\n--- stdout ---\n${result.stdout}\n\n--- stderr ---\n${result.stderr}`;
    } catch (e) {
      return `Error running code: ${e.message}`;
    }
  }

  return `Error: unknown tool "${toolName}". Available tools: ${Object.keys(TOOLS).join(', ')}, plus connector tools (github_*, supabase_*, gmail_*, calendar_*, drive_*), run_code`;
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
