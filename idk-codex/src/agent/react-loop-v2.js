/**
 * MAX 2.0 — ReAct Agent Loop with OpenAI Function Calling
 *
 * Triple fallback strategy:
 *   1. OpenAI function calling (tools array) — works with most OpenRouter models
 *   2. XML <tool> tag parsing — fallback for models without function calling
 *   3. Markdown code block extraction — last resort for any model
 *
 * The agent:
 *   1. Sends task + tools to LLM
 *   2. LLM responds with text and/or tool_calls
 *   3. Executes tool calls, feeds results back
 *   4. Repeats until task_complete is called or max iterations
 */

import { generateCompletion } from '../groq/client.js';
import { executeTool, getToolDescriptions } from './tools/registry.js';
import { broadcastProgress, broadcastMessage } from '../api/websocket.js';
import { addConversationMessage, createConversation } from '../database/conversations-supabase.js';
import { condenseMessages } from './condenser.js';
import { uploadToSupabase, isSupabaseConfigured } from './supabase-storage.js';
import logger from '../utils/logger.js';

const MAX_ITERATIONS = parseInt(process.env.MAX_AGENT_ITERATIONS || '15', 10);
const MAX_ACTION_TOKENS = parseInt(process.env.MAX_ACTION_TOKENS || '8000', 10);

// ============================================================================
// FUNCTION CALLING TOOL DEFINITIONS
// ============================================================================

const FUNCTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run a shell command in the workspace. Returns stdout and stderr.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'Shell command to run' } },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with content. Creates parent dirs.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace' },
          content: { type: 'string', description: 'Full file content (raw, not HTML-escaped)' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file with line numbers. Max 200 lines.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          offset: { type: 'number', description: 'Starting line (default 1)' },
          limit: { type: 'number', description: 'Max lines (default 200)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Search and replace text in a file. old_text must match exactly.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_text: { type: 'string', description: 'Text to find (must match exactly)' },
          new_text: { type: 'string', description: 'Replacement text' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: workspace root)' },
          recursive: { type: 'boolean', description: 'List recursively (default false)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search for text in files (grep) or find files by name (glob with pattern: prefix).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          path: { type: 'string', description: 'Directory to search (default: root)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch a URL and return text content. Max 5000 chars.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL to fetch' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description: 'Call this when the task is fully done. Provide a summary of what was accomplished.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string', description: 'What was accomplished' } },
        required: ['summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Open a URL in the browser',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL to navigate to' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current browser page',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_click',
      description: 'Click an element by CSS selector or text',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector or text to click' },
          by_text: { type: 'boolean', description: 'If true, find element by text content' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_type',
      description: 'Type text into an input field',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of input' },
          text: { type: 'string', description: 'Text to type' },
          clear_first: { type: 'boolean', description: 'Clear field first' }
        },
        required: ['selector', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_get_text',
      description: 'Extract visible text from the page',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS selector (default: body)' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser_evaluate',
      description: 'Run JavaScript in the browser',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string', description: 'JavaScript to evaluate' } },
        required: ['code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_save',
      description: 'Save something to persistent memory — survives restarts',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Unique key name' },
          value: { type: 'string', description: 'Value to remember' },
          tags: { type: 'string', description: 'Comma-separated tags' }
        },
        required: ['key', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_get',
      description: 'Retrieve something from persistent memory',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string', description: 'Key to retrieve' } },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_list',
      description: 'List all saved memories',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(workspacePath) {
  return `You are MAX, an autonomous software engineer. Complete the task fully using the available tools.

You work in: ${workspacePath}

Rules:
- Use tools to actually DO things, not just describe them.
- Write real, complete, working code — not placeholders.
- After writing files, run them to verify they work.
- Use memory_save to remember important details for future tasks.
- Use browser tools to browse websites when needed.
- When completely done, call task_complete with a summary.
- Keep text responses short. Let tool calls do the work.`;
}

// ============================================================================
// CODE BLOCK EXTRACTOR (fallback for models without function calling)
// ============================================================================

function extractCodeBlocks(text) {
  const blocks = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let blockIndex = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const language = match[1] || 'txt';
    const code = match[2].trim();
    if (!code || code.length < 10) continue;

    let filename;
    const taskLower = text.toLowerCase();
    const filenameMatch = text.substring(Math.max(0, match.index - 200), match.index).match(/(?:file|name|save|create|path)[:\s]+([a-zA-Z0-9_\-\/]+\.\w+)/i);
    if (filenameMatch) {
      filename = filenameMatch[1];
    } else {
      const extMap = { python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh', java: 'java', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', sql: 'sql' };
      const ext = extMap[language.toLowerCase()] || 'txt';
      if (taskLower.includes('html') || taskLower.includes('web page') || taskLower.includes('landing')) {
        filename = blockIndex === 0 ? 'index.html' : `page${blockIndex}.html`;
      } else if (taskLower.includes('css') || taskLower.includes('style')) {
        filename = 'styles.css';
      } else if (taskLower.includes('javascript') || taskLower.includes('script')) {
        filename = blockIndex === 0 ? 'script.js' : `script${blockIndex}.js`;
      } else if (taskLower.includes('python') || language === 'python' || language === 'py') {
        filename = blockIndex === 0 ? 'main.py' : `module${blockIndex}.py`;
      } else {
        filename = `file_${blockIndex}.${ext}`;
      }
    }
    blocks.push({ filename, code, language });
    blockIndex++;
  }
  return blocks;
}

// ============================================================================
// XML TOOL PARSER (fallback #2)
// ============================================================================

function parseToolCalls(text) {
  const toolCalls = [];
  const toolRegex = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/g;
  let match;
  while ((match = toolRegex.exec(text)) !== null) {
    const toolName = match[1];
    const toolBody = match[2];
    const args = {};
    const argRegex = /<arg\s+name="([^"]+)">([\s\S]*?)<\/arg>/g;
    let argMatch;
    while ((argMatch = argRegex.exec(toolBody)) !== null) {
      args[argMatch[1]] = argMatch[2].replace(/^\n+/, '').replace(/\n+$/, '');
    }
    toolCalls.push({ name: toolName, args });
  }
  return { reasoning: text.replace(toolRegex, '').trim(), toolCalls };
}

// ============================================================================
// REACT LOOP
// ============================================================================

export async function executeReActLoop(task, sessionId, userId, options = {}) {
  const workspacePath = options.workspacePath || process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

  logger.info('REACT_LOOP_START', { task: task.substring(0, 100), sessionId });

  const systemPrompt = buildSystemPrompt(workspacePath);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task }
  ];

  const filesModified = new Set();
  let iteration = 0;
  let finalSummary = '';
  let isDone = false;

  broadcastProgress(sessionId, { phase: 'react', status: 'running', iteration: 0, task });
  broadcastMessage(sessionId, { role: 'assistant', content: '', type: 'streaming_start' });

  while (iteration < MAX_ITERATIONS && !isDone) {
    iteration++;
    logger.info('REACT_ITERATION', { sessionId, iteration });

    broadcastProgress(sessionId, { phase: 'react', status: 'thinking', iteration });

    // Call LLM with function calling tools
    let llmResult;
    try {
      const condensedMessages = await condenseMessages(messages, { maxTokens: 6000, keepRecent: 8 });

      // Disable Echo for real tasks
      const prevEcho = process.env.ECHO_PROVIDER_ENABLED;
      process.env.ECHO_PROVIDER_ENABLED = 'false';

      llmResult = await generateCompletion(condensedMessages, {
        temperature: 0.2,
        maxTokens: MAX_ACTION_TOKENS,
        tools: FUNCTION_TOOLS,
        tool_choice: 'auto'
      });

      process.env.ECHO_PROVIDER_ENABLED = prevEcho;
    } catch (err) {
      logger.error('REACT_LLM_ERROR', { iteration, error: err.message });
      finalSummary = 'I could not process this because all LLM providers failed: ' + err.message;
      break;
    }

    const llmContent = llmResult?.content || '';
    const llmToolCalls = llmResult?.tool_calls || null;

    messages.push({ role: 'assistant', content: llmContent, tool_calls: llmToolCalls || undefined });

    // ===== PATH 1: Function calling (preferred) =====
    if (llmToolCalls && Array.isArray(llmToolCalls) && llmToolCalls.length > 0) {
      logger.info('REACT_FUNCTION_CALLS', { sessionId, iteration, count: llmToolCalls.length });

      for (const tc of llmToolCalls) {
        const toolName = tc.function?.name || tc.name;
        let toolArgs = {};
        try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch (e) { toolArgs = {}; }

        // Check for task_complete
        if (toolName === 'task_complete') {
          finalSummary = toolArgs.summary || 'Task complete';
          isDone = true;
          logger.info('REACT_DONE', { sessionId, iteration, summary: finalSummary.substring(0, 100) });
          break;
        }

        // Map edit_file old_text/new_text to old_text/new_text (keep consistent)
        if (toolName === 'edit_file' && toolArgs.old_str) {
          toolArgs.old_text = toolArgs.old_str;
          toolArgs.new_text = toolArgs.new_str;
        }

        logger.info('REACT_TOOL_CALL', { sessionId, iteration, tool: toolName, args: JSON.stringify(toolArgs).substring(0, 200) });

        broadcastProgress(sessionId, { phase: 'react', status: 'executing_tool', iteration, tool: toolName, args: toolArgs });

        if (toolName === 'write_file' || toolName === 'edit_file') {
          if (toolArgs.path) filesModified.add(toolArgs.path);
        }

        const toolResult = await executeTool(toolName, toolArgs);

        broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: toolName, result: toolResult.substring(0, 500) });

        // Vision: if result is a screenshot (base64 image), send as vision message
        if (toolResult.startsWith('data:image/')) {
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: '(Screenshot from ' + toolName + ') — analyze what you see and decide next action:' },
              { type: 'image_url', image_url: { url: toolResult, detail: 'high' } }
            ]
          });
        } else {
          // Add tool result as a tool message (OpenAI format)
          messages.push({
            role: 'tool',
            tool_call_id: tc.id || toolName,
            content: toolResult
          });
        }
      }

      if (isDone) break;
      continue;
    }

    // ===== PATH 2: XML tool parsing (fallback) =====
    const { reasoning, toolCalls: xmlToolCalls } = parseToolCalls(llmContent);

    if (xmlToolCalls.length > 0) {
      logger.info('REACT_XML_TOOLS', { sessionId, iteration, count: xmlToolCalls.length });

      for (const tc of xmlToolCalls) {
        if (tc.name === 'task_complete') {
          finalSummary = tc.args.summary || 'Task complete';
          isDone = true;
          break;
        }

        if (tc.name === 'write_file' || tc.name === 'edit_file') {
          if (tc.args.path) filesModified.add(tc.args.path);
        }

        logger.info('REACT_TOOL_CALL', { sessionId, iteration, tool: tc.name, args: JSON.stringify(tc.args).substring(0, 200) });

        broadcastProgress(sessionId, { phase: 'react', status: 'executing_tool', iteration, tool: tc.name, args: tc.args });

        const toolResult = await executeTool(tc.name, tc.args);

        broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: tc.name, result: toolResult.substring(0, 500) });

        messages.push({ role: 'user', content: '(Tool result for ' + tc.name + '):\n' + toolResult });
      }

      if (isDone) break;
      continue;
    }

    // ===== PATH 3: Code block extraction (last resort) =====
    const codeBlocks = extractCodeBlocks(llmContent);

    if (codeBlocks.length > 0) {
      logger.info('REACT_CODE_EXTRACTION', { sessionId, iteration, blocks: codeBlocks.length });

      for (const block of codeBlocks) {
        try {
          const result = await executeTool('write_file', { path: block.filename, content: block.code });
          filesModified.add(block.filename);
          logger.info('REACT_AUTO_WRITE', { sessionId, file: block.filename, size: block.code.length });

          broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: 'write_file (auto)', result: result.substring(0, 200) });
          messages.push({ role: 'user', content: '(Auto-extracted and saved to ' + block.filename + ')\n' + result });
        } catch (e) {
          logger.warn('REACT_AUTO_WRITE_FAILED', { file: block.filename, error: e.message });
        }
      }

      if (iteration >= 3 || llmContent.toLowerCase().includes('done')) {
        finalSummary = 'Created ' + codeBlocks.length + ' file(s): ' + Array.from(filesModified).join(', ');
        isDone = true;
        break;
      }

      messages.push({ role: 'user', content: 'Code saved. Continue if needed, or call task_complete to finish.' });
      continue;
    }

    // ===== PATH 4: No tools, no code — conversational response =====
    finalSummary = llmContent.trim();
    isDone = true;
    logger.info('REACT_NO_TOOLS_DONE', { sessionId, iteration, len: finalSummary.length });
    break;
  }

  if (!isDone && !finalSummary) {
    finalSummary = 'Reached max iterations (' + MAX_ITERATIONS + '). Files modified: ' + (Array.from(filesModified).join(', ') || 'none');
  }

  broadcastProgress(sessionId, { phase: 'react', status: 'complete', iteration, summary: finalSummary, filesModified: Array.from(filesModified) });

  try {
    await addConversationMessage(sessionId, 'assistant', finalSummary, {
      type: 'task_complete', iterations: iteration, filesModified: Array.from(filesModified)
    });
  } catch (e) {
    logger.warn('Failed to save summary', { error: e.message });
  }

  broadcastMessage(sessionId, { role: 'assistant', content: finalSummary, type: 'task_complete', filesModified: Array.from(filesModified) });

  if (isSupabaseConfigured() && filesModified.size > 0) {
    for (const filePath of filesModified) {
      try { await uploadToSupabase(filePath, sessionId); } catch (e) { /* ok */ }
    }
  }

  logger.info('REACT_LOOP_COMPLETE', { sessionId, iterations: iteration, filesModified: filesModified.size, success: isDone });

  return { success: isDone, summary: finalSummary, iterations: iteration, filesModified: Array.from(filesModified) };
}

export { parseToolCalls, extractCodeBlocks, FUNCTION_TOOLS };
export default { executeReActLoop, parseToolCalls, extractCodeBlocks, FUNCTION_TOOLS };
