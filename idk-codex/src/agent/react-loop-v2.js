/**
 * MAX 2.0 — ReAct Agent Loop with OpenAI Function Calling
 *
 * Calls the OpenAI-compatible provider DIRECTLY (bypasses adapter) to ensure
 * tools[] and tool_calls pass through correctly.
 *
 * Triple fallback:
 *   1. OpenAI function calling (tools array)
 *   2. XML <tool> tag parsing
 *   3. Markdown code block extraction
 */

import { executeTool } from './tools/registry.js';
import { broadcastProgress, broadcastMessage } from '../api/websocket.js';
import { addConversationMessage } from '../database/conversations-supabase.js';
import { getRelevantMemories } from './tools/memory-tool.js';
import { uploadToSupabase, isSupabaseConfigured } from './supabase-storage.js';
import logger from '../utils/logger.js';

const MAX_ITERATIONS = 20;

// ============================================================================
// TOOL DEFINITIONS FOR FUNCTION CALLING
// ============================================================================

const AGENT_TOOLS = [
  { type: 'function', function: { name: 'bash', description: 'Run any shell command in the sandbox workspace. Use for: creating files, installing packages, running code, checking output.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'Shell command to execute' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Create or overwrite a file with content', parameters: { type: 'object', properties: { path: { type: 'string', description: 'File path relative to workspace' }, content: { type: 'string', description: 'Full file content (raw, not HTML-escaped)' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'read_file', description: 'Read a file and return its content with line numbers', parameters: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'edit_file', description: 'Find and replace text in a file. old_str must match exactly.', parameters: { type: 'object', properties: { path: { type: 'string' }, old_str: { type: 'string' }, new_str: { type: 'string' } }, required: ['path', 'old_str', 'new_str'] } } },
  { type: 'function', function: { name: 'list_files', description: 'List files and folders in a directory', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'search', description: 'Search for text across all files', parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'web_fetch', description: 'Fetch a URL and return text content', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'browser_navigate', description: 'Open a website URL in the browser', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'browser_screenshot', description: 'Take a screenshot of the current browser page', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'browser_click', description: 'Click an element on the page', parameters: { type: 'object', properties: { selector: { type: 'string' }, by_text: { type: 'boolean' } }, required: ['selector'] } } },
  { type: 'function', function: { name: 'browser_type', description: 'Type text into an input field', parameters: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' }, clear_first: { type: 'boolean' } }, required: ['selector', 'text'] } } },
  { type: 'function', function: { name: 'browser_get_text', description: 'Get visible text from the page', parameters: { type: 'object', properties: { selector: { type: 'string' } } } } },
  { type: 'function', function: { name: 'browser_evaluate', description: 'Run JavaScript in the browser', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } } },
  { type: 'function', function: { name: 'memory_save', description: 'Save something to persistent memory that survives between sessions', parameters: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] } } },
  { type: 'function', function: { name: 'memory_get', description: 'Retrieve something from persistent memory', parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } } },
  { type: 'function', function: { name: 'memory_list', description: 'List all saved memories', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'task_complete', description: 'Call this when the task is fully done. Ends the agent loop.', parameters: { type: 'object', properties: { summary: { type: 'string', description: 'Clear summary of what was accomplished' }, files_created: { type: 'array', items: { type: 'string' } } }, required: ['summary'] } } }
];

// ============================================================================
// DIRECT LLM CALL (bypasses adapter to ensure tools pass through)
// ============================================================================

async function callLLM(messages, tools) {
  const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL || 'https://openrouter.ai/api/v1';
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
  const model = process.env.OPENAI_COMPATIBLE_MODEL || 'openai/gpt-oss-20b:free';

  const body = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: 8000
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  // Add OpenRouter headers
  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
  if (baseURL.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://maxxxxx-production.up.railway.app';
    headers['X-Title'] = 'MAX Agent';
  }

  logger.info('LLM call', { model, messageCount: messages.length, hasTools: !!(tools && tools.length) });

  const response = await fetch(baseURL + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('LLM returned ' + response.status + ': ' + errorText.substring(0, 500));
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  return {
    content: message?.content || '',
    tool_calls: message?.tool_calls || null,
    finishReason: data.choices?.[0]?.finish_reason || 'stop',
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };
}

// ============================================================================
// CODE BLOCK EXTRACTOR (fallback)
// ============================================================================

function extractCodeBlocks(text) {
  const blocks = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    const lang = match[1] || 'txt';
    const code = match[2].trim();
    if (!code || code.length < 10) continue;

    let filename;
    const extMap = { python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', html: 'html', css: 'css', json: 'json', java: 'java', go: 'go' };
    const ext = extMap[lang.toLowerCase()] || 'txt';
    const lower = text.toLowerCase();

    if (lower.includes('html') || lower.includes('web page') || lower.includes('landing')) {
      filename = i === 0 ? 'index.html' : 'page' + i + '.html';
    } else if (lower.includes('css') || lower.includes('style')) {
      filename = 'styles.css';
    } else if (lower.includes('python') || lang === 'python') {
      filename = i === 0 ? 'main.py' : 'module' + i + '.py';
    } else if (lower.includes('javascript') || lower.includes('script')) {
      filename = i === 0 ? 'script.js' : 'script' + i + '.js';
    } else {
      filename = 'file_' + i + '.' + ext;
    }

    blocks.push({ filename, code, language: lang });
    i++;
  }
  return blocks;
}

// ============================================================================
// XML TOOL PARSER (fallback)
// ============================================================================

function parseXMLTools(text) {
  const toolCalls = [];
  const regex = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const body = match[2];
    const args = {};
    const argRegex = /<arg\s+name="([^"]+)">([\s\S]*?)<\/arg>/g;
    let argMatch;
    while ((argMatch = argRegex.exec(body)) !== null) {
      args[argMatch[1]] = argMatch[2].replace(/^\n+/, '').replace(/\n+$/, '');
    }
    toolCalls.push({ name, args });
  }
  return { reasoning: text.replace(regex, '').trim(), toolCalls };
}

// ============================================================================
// REACT LOOP
// ============================================================================

export async function executeReActLoop(task, sessionId, userId, options = {}) {
  const workspacePath = options.workspacePath || process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

  logger.info('REACT_LOOP_START', { task: task.substring(0, 100), sessionId });

  // Inject relevant memories
  const memoryContext = getRelevantMemories(task);

  const systemPrompt = 'You are MAX, an autonomous AI agent. Complete the task fully by using the available tools.\n' +
    'You work in: ' + workspacePath + '\n\n' +
    'Rules:\n' +
    '- Use tools to DO things, not just describe them.\n' +
    '- Write real, complete, working code.\n' +
    '- After writing files, run them to verify.\n' +
    '- Use memory_save for anything the user might ask about later.\n' +
    '- When completely done, call task_complete with a summary.' +
    (memoryContext ? memoryContext : '');

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task }
  ];

  const filesModified = new Set();
  let iteration = 0;
  let finalSummary = '';
  let isDone = false;

  broadcastProgress(sessionId, { phase: 'react', status: 'running', iteration: 0, task });

  while (iteration < MAX_ITERATIONS && !isDone) {
    iteration++;
    logger.info('REACT_ITERATION', { sessionId, iteration });

    broadcastProgress(sessionId, { phase: 'react', status: 'thinking', iteration, maxIterations: MAX_ITERATIONS });

    // Call LLM directly (bypasses adapter — ensures tools pass through)
    let llmResult;
    try {
      llmResult = await callLLM(messages, AGENT_TOOLS);

      // CRITICAL: If model returns empty content AND no tool calls, retry WITHOUT tools
      // Some free models (gpt-oss-20b) return empty when they see function calling tools
      if (!llmResult.content && !llmResult.tool_calls) {
        logger.warn('REACT_EMPTY_RESPONSE_RETRY', { sessionId, iteration, model: process.env.OPENAI_COMPATIBLE_MODEL });
        llmResult = await callLLM(messages, null); // retry without tools
      }
    } catch (err) {
      logger.error('REACT_LLM_ERROR', { iteration, error: err.message });

      // If tools call failed, try without tools as fallback
      try {
        logger.warn('REACT_FALLBACK_NO_TOOLS', { sessionId, iteration });
        llmResult = await callLLM(messages, null);
      } catch (err2) {
        finalSummary = 'LLM error: ' + err2.message;
        break;
      }
    }

    const llmContent = llmResult.content || '';
    const llmToolCalls = llmResult.tool_calls || null;

    // Add assistant response to messages
    const assistantMsg = { role: 'assistant', content: llmContent };
    if (llmToolCalls) assistantMsg.tool_calls = llmToolCalls;
    messages.push(assistantMsg);

    // ===== PATH 1: Function calling =====
    if (llmToolCalls && Array.isArray(llmToolCalls) && llmToolCalls.length > 0) {
      logger.info('REACT_FUNCTION_CALLS', { sessionId, iteration, count: llmToolCalls.length });

      for (const tc of llmToolCalls) {
        const toolName = tc.function?.name || tc.name;
        let toolArgs = {};
        try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch (e) { toolArgs = {}; }

        // task_complete ends the loop
        if (toolName === 'task_complete') {
          finalSummary = toolArgs.summary || 'Task complete';
          isDone = true;
          logger.info('REACT_DONE', { sessionId, iteration });
          break;
        }

        // Map old_str/new_str aliases
        if (toolName === 'edit_file' && toolArgs.old_str) {
          toolArgs.old_text = toolArgs.old_str;
          toolArgs.new_text = toolArgs.new_str;
        }

        if (toolName === 'write_file' || toolName === 'edit_file') {
          if (toolArgs.path) filesModified.add(toolArgs.path);
        }

        logger.info('REACT_TOOL_CALL', { sessionId, iteration, tool: toolName, args: JSON.stringify(toolArgs).substring(0, 200) });
        broadcastProgress(sessionId, { phase: 'react', status: 'executing_tool', iteration, tool: toolName, args: toolArgs });

        const toolResult = await executeTool(toolName, toolArgs);

        broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: toolName, result: toolResult.substring(0, 500) });

        // Vision: screenshots sent as image_url
        if (toolResult.startsWith('data:image/')) {
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: 'Screenshot from ' + toolName + '. Analyze what you see:' },
              { type: 'image_url', image_url: { url: toolResult, detail: 'high' } }
            ]
          });
        } else {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id || toolName,
            content: String(toolResult)
          });
        }
      }

      if (isDone) break;
      continue;
    }

    // ===== PATH 2: XML tool parsing =====
    const { toolCalls: xmlCalls } = parseXMLTools(llmContent);
    if (xmlCalls.length > 0) {
      logger.info('REACT_XML_TOOLS', { sessionId, iteration, count: xmlCalls.length });

      for (const tc of xmlCalls) {
        if (tc.name === 'task_complete') {
          finalSummary = tc.args.summary || 'Task complete';
          isDone = true;
          break;
        }

        if (tc.name === 'write_file' || tc.name === 'edit_file') {
          if (tc.args.path) filesModified.add(tc.args.path);
        }

        logger.info('REACT_TOOL_CALL', { sessionId, iteration, tool: tc.name });
        broadcastProgress(sessionId, { phase: 'react', status: 'executing_tool', iteration, tool: tc.name, args: tc.args });

        const toolResult = await executeTool(tc.name, tc.args);

        broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: tc.name, result: toolResult.substring(0, 500) });
        messages.push({ role: 'user', content: '(Tool result for ' + tc.name + '):\n' + toolResult });
      }

      if (isDone) break;
      continue;
    }

    // ===== PATH 3: Code block extraction =====
    const codeBlocks = extractCodeBlocks(llmContent);
    if (codeBlocks.length > 0) {
      logger.info('REACT_CODE_EXTRACTION', { sessionId, iteration, blocks: codeBlocks.length });

      for (const block of codeBlocks) {
        try {
          const result = await executeTool('write_file', { path: block.filename, content: block.code });
          filesModified.add(block.filename);
          logger.info('REACT_AUTO_WRITE', { sessionId, file: block.filename });
          broadcastProgress(sessionId, { phase: 'react', status: 'tool_result', iteration, tool: 'write_file (auto)', result: result.substring(0, 200) });
          messages.push({ role: 'user', content: '(Auto-saved to ' + block.filename + ')\n' + result });
        } catch (e) {
          logger.warn('REACT_AUTO_WRITE_FAILED', { file: block.filename, error: e.message });
        }
      }

      if (iteration >= 3 || llmContent.toLowerCase().includes('done')) {
        finalSummary = 'Created ' + codeBlocks.length + ' file(s): ' + Array.from(filesModified).join(', ');
        isDone = true;
        break;
      }
      continue;
    }

    // ===== PATH 4: No tools — conversational response =====
    finalSummary = llmContent.trim();
    isDone = true;
    logger.info('REACT_NO_TOOLS_DONE', { sessionId, iteration, len: finalSummary.length });
    break;
  }

  if (!isDone && !finalSummary) {
    finalSummary = 'Reached max iterations (' + MAX_ITERATIONS + '). Files: ' + (Array.from(filesModified).join(', ') || 'none');
  }

  // Save and broadcast
  broadcastProgress(sessionId, { phase: 'react', status: 'complete', iteration, summary: finalSummary, filesModified: Array.from(filesModified) });

  try {
    await addConversationMessage(sessionId, 'assistant', finalSummary, { type: 'task_complete', iterations: iteration, filesModified: Array.from(filesModified) });
  } catch (e) {
    logger.warn('Failed to save summary', { error: e.message });
  }

  broadcastMessage(sessionId, { role: 'assistant', content: finalSummary, type: 'task_complete', filesModified: Array.from(filesModified) });

  // Upload to Supabase
  if (isSupabaseConfigured() && filesModified.size > 0) {
    for (const filePath of filesModified) {
      try { await uploadToSupabase(filePath, sessionId); } catch (e) { /* ok */ }
    }
  }

  logger.info('REACT_LOOP_COMPLETE', { sessionId, iterations: iteration, filesModified: filesModified.size, success: isDone });
  return { success: isDone, summary: finalSummary, iterations: iteration, filesModified: Array.from(filesModified) };
}

export { AGENT_TOOLS, extractCodeBlocks, parseXMLTools };
export default { executeReActLoop, AGENT_TOOLS };
