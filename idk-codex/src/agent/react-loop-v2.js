/**
 * MAX 2.0 — ReAct Agent Loop
 *
 * The core agent engine. Replaces the old 5-phase loop with a dynamic
 * Think → Act → Observe loop inspired by OpenHands, SWE-agent, and Aider.
 *
 * How it works:
 *   1. Send the user's task + tool descriptions to the LLM
 *   2. LLM responds with reasoning + optional tool calls (text-based protocol)
 *   3. Parse tool calls from the response
 *   4. Execute each tool, collect results
 *   5. Feed results back to the LLM as observations
 *   6. Repeat until LLM says "DONE:" or max iterations reached
 *
 * The text-based tool protocol:
 *   <tool name="bash">
 *   <arg name="command">ls -la</arg>
 *   </tool>
 *
 * This works with ANY model — no function calling needed.
 */

import { generateCompletion } from '../groq/client.js';
import { executeTool, getToolDescriptions } from './tools/registry.js';
import { broadcastProgress, broadcastMessage } from '../api/websocket.js';
import { addConversationMessage, createConversation } from '../database/conversations-supabase.js';
import { condenseMessages } from './condenser.js';
import { uploadToSupabase, isSupabaseConfigured } from './supabase-storage.js';
import logger from '../utils/logger.js';

const MAX_ITERATIONS = parseInt(process.env.MAX_AGENT_ITERATIONS || '15', 10);
const MAX_THINKING_TOKENS = parseInt(process.env.MAX_THINKING_TOKENS || '2000', 10);
const MAX_ACTION_TOKENS = parseInt(process.env.MAX_ACTION_TOKENS || '6000', 10);

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(workspacePath) {
  const toolDescs = getToolDescriptions();

  return `You are MAX, an autonomous software engineer. You MUST use tools to complete tasks. You work in ${workspacePath}.

CRITICAL: You MUST call at least one tool before saying DONE. If you do not call a tool, the task fails.

To call a tool, write this EXACT format:

<tool name="write_file">
<arg name="path">hello.py</arg>
<arg name="content">print("hello")</arg>
</tool>

Available tools:
${toolDescs}

Workflow:
1. Call write_file to create the file(s) the user asked for
2. Call bash to verify it works
3. Say DONE: <summary>

Example for "Create hello.py":
<tool name="write_file">
<arg name="path">hello.py</arg>
<arg name="content">print("Hello, World!")
</arg>
</tool>

Example for "Build an HTML page":
<tool name="write_file">
<arg name="path">index.html</arg>
<arg name="content"><!DOCTYPE html>
<html>
<head><title>My Page</title></head>
<body><h1>Hello</h1></body>
</html></arg>
</tool>

RULES:
- ALWAYS call a tool. DO IT, do not describe it.
- Write REAL complete code, not placeholders.
- Do NOT HTML-escape code. Write < not &lt;
- After writing files, say: DONE: <what you did>
- Keep text SHORT. Tool calls do the work.`;
}

// ============================================================================
// CODE BLOCK EXTRACTOR (fallback for models that don't use XML tool format)
// ============================================================================

/**
 * Extract code blocks from markdown-formatted LLM responses.
 * Works with ```python, ```javascript, ```html, ```css, ```json, etc.
 * Also works with plain code blocks without language tags.
 *
 * @param {string} text - LLM response text
 * @returns {Array<{filename, code, language}>}
 */
function extractCodeBlocks(text) {
  const blocks = [];

  // Match ```language\n...code...\n``` blocks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let blockIndex = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const language = match[1] || 'txt';
    const code = match[2].trim();

    if (!code || code.length < 10) continue;

    // Determine filename from language
    let filename;
    const taskLower = text.toLowerCase();

    // Try to find a filename mentioned in the text near the code block
    const filenameMatch = text.substring(Math.max(0, match.index - 200), match.index).match(/(?:file|name|save|create|path)[:\s]+([a-zA-Z0-9_\-\/]+\.\w+)/i);
    if (filenameMatch) {
      filename = filenameMatch[1];
    } else {
      // Auto-generate filename from language
      const extMap = {
        python: 'py', py: 'py',
        javascript: 'js', js: 'js',
        typescript: 'ts', ts: 'ts',
        html: 'html',
        css: 'css',
        json: 'json',
        bash: 'sh', sh: 'sh',
        java: 'java',
        cpp: 'cpp', c: 'c',
        go: 'go',
        rust: 'rs',
        ruby: 'rb',
        php: 'php',
        sql: 'sql',
        yaml: 'yaml', yml: 'yaml',
        xml: 'xml',
        markdown: 'md', md: 'md'
      };

      const ext = extMap[language.toLowerCase()] || 'txt';

      // If the task mentions a specific file type, use that
      if (taskLower.includes('html') || taskLower.includes('web page') || taskLower.includes('landing')) {
        filename = blockIndex === 0 ? 'index.html' : `page${blockIndex}.html`;
      } else if (taskLower.includes('css') || taskLower.includes('style')) {
        filename = 'styles.css';
      } else if (taskLower.includes('javascript') || taskLower.includes('script')) {
        filename = blockIndex === 0 ? 'script.js' : `script${blockIndex}.js`;
      } else if (taskLower.includes('python') || language === 'python' || language === 'py') {
        filename = blockIndex === 0 ? 'main.py' : `module${blockIndex}.py`;
      } else if (taskLower.includes('react') || taskLower.includes('component')) {
        filename = `Component${blockIndex}.jsx`;
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
// TOOL CALL PARSER
// ============================================================================

/**
 * Parse tool calls from LLM response text.
 * Looks for <tool name="...">...<arg name="...">...</arg>...</tool> blocks.
 *
 * @param {string} text - the LLM response
 * @returns {{ reasoning: string, toolCalls: Array<{name, args}> }}
 */
export function parseToolCalls(text) {
  const toolCalls = [];
  let reasoning = text;

  // Regex to match <tool name="...">...</tool> blocks
  const toolRegex = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/g;
  let match;

  while ((match = toolRegex.exec(text)) !== null) {
    const toolName = match[1];
    const toolBody = match[2];

    // Parse arguments
    const args = {};
    const argRegex = /<arg\s+name="([^"]+)">([\s\S]*?)<\/arg>/g;
    let argMatch;
    while ((argMatch = argRegex.exec(toolBody)) !== null) {
      const argName = argMatch[1];
      let argValue = argMatch[2];

      // Remove leading/trailing whitespace from the value but preserve internal formatting
      argValue = argValue.replace(/^\n+/, '').replace(/\n+$/, '');

      args[argName] = argValue;
    }

    toolCalls.push({ name: toolName, args });
  }

  // Remove tool blocks from reasoning text
  reasoning = text.replace(toolRegex, '').trim();

  return { reasoning, toolCalls };
}

// ============================================================================
// REACT LOOP
// ============================================================================

/**
 * Execute the ReAct agent loop for a task.
 *
 * @param {string} task - the user's task
 * @param {string} sessionId - session ID for WebSocket updates
 * @param {string} userId - user ID
 * @param {Object} options - { workspacePath, model, onProgress }
 * @returns {Promise<Object>} { success, summary, iterations, filesModified }
 */
export async function executeReActLoop(task, sessionId, userId, options = {}) {
  const workspacePath = options.workspacePath || process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
  const onProgress = options.onProgress || (() => {});

  logger.info('REACT_LOOP_START', { task: task.substring(0, 100), sessionId, workspacePath });

  const systemPrompt = buildSystemPrompt(workspacePath);

  // Conversation history for the LLM (system + user + observations)
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task }
  ];

  const filesModified = new Set();
  let iteration = 0;
  let finalSummary = '';
  let isDone = false;

  // Broadcast start
  broadcastProgress(sessionId, {
    phase: 'react',
    status: 'running',
    iteration: 0,
    maxIterations: MAX_ITERATIONS,
    task
  });
  onProgress({ phase: 'react', status: 'running', iteration: 0 });

  while (iteration < MAX_ITERATIONS && !isDone) {
    iteration++;
    logger.info('REACT_ITERATION', { sessionId, iteration, messageCount: messages.length });

    // Broadcast iteration start
    broadcastProgress(sessionId, {
      phase: 'react',
      status: 'thinking',
      iteration,
      maxIterations: MAX_ITERATIONS
    });
    onProgress({ phase: 'react', status: 'thinking', iteration });

    // Call the LLM — NEVER use Echo provider for the ReAct loop
    let llmResponse;
    try {
      // Condense messages if the conversation is getting too long
      const condensedMessages = await condenseMessages(messages, {
        maxTokens: 6000,
        keepRecent: 8
      });

      // Temporarily disable Echo so the adapter doesn't fall back to it
      const prevEchoEnabled = process.env.ECHO_PROVIDER_ENABLED;
      process.env.ECHO_PROVIDER_ENABLED = 'false';

      // Force using the adapter's current provider (don't let it fall back to Echo)
      const result = await generateCompletion(condensedMessages, {
        temperature: 0.3,
        maxTokens: MAX_ACTION_TOKENS
      });

      // Restore Echo setting
      process.env.ECHO_PROVIDER_ENABLED = prevEchoEnabled;

      llmResponse = result?.content || '';
    } catch (err) {
      logger.error('REACT_LLM_ERROR', { iteration, error: err.message });
      finalSummary = `I couldn't process this because all LLM providers failed: ${err.message}. Please check your API keys or connect your phone.`;
      break;
    }

    if (!llmResponse || llmResponse.trim() === '') {
      finalSummary = `LLM returned empty response at iteration ${iteration}`;
      break;
    }

    // Check if the LLM said DONE
    const doneMatch = llmResponse.match(/DONE:\s*([\s\S]*?)(?:$|<\/tool>)/i);
    if (doneMatch) {
      finalSummary = doneMatch[1].trim();
      isDone = true;
      logger.info('REACT_DONE', { sessionId, iteration, summary: finalSummary.substring(0, 100) });
    }

    // Parse tool calls
    const { reasoning, toolCalls } = parseToolCalls(llmResponse);

    // Broadcast the LLM's reasoning (for UI display)
    broadcastProgress(sessionId, {
      phase: 'react',
      status: 'acting',
      iteration,
      reasoning: reasoning.substring(0, 500),
      toolCount: toolCalls.length
    });
    onProgress({
      phase: 'react',
      status: 'acting',
      iteration,
      reasoning,
      toolCalls
    });

    // Add the LLM response to conversation history
    messages.push({ role: 'assistant', content: llmResponse });

    // If no tool calls and not done, check if this is actually a chat response
    if (toolCalls.length === 0 && !isDone) {
      // FALLBACK: Extract code from markdown blocks and save as files
      // This works with ANY model, even ones that don't follow the XML tool format
      const codeBlocks = extractCodeBlocks(llmResponse);

      if (codeBlocks.length > 0) {
        logger.info('REACT_CODE_EXTRACTION', { sessionId, iteration, blocksFound: codeBlocks.length });

        for (const block of codeBlocks) {
          try {
            const result = await executeTool('write_file', {
              path: block.filename,
              content: block.code
            });
            filesModified.add(block.filename);
            logger.info('REACT_AUTO_WRITE', { sessionId, file: block.filename, size: block.code.length });

            // Broadcast the auto-write as a tool call
            broadcastProgress(sessionId, {
              phase: 'react',
              status: 'tool_result',
              iteration,
              tool: 'write_file (auto-extracted)',
              result: result.substring(0, 200)
            });

            messages.push({
              role: 'user',
              content: '(Auto-extracted code from your response and saved to ' + block.filename + ')\n' + result
            });
          } catch (e) {
            logger.warn('REACT_AUTO_WRITE_FAILED', { file: block.filename, error: e.message });
          }
        }

        // Now check if we should continue or finish
        if (llmResponse.toLowerCase().includes('done') || iteration >= 3) {
          finalSummary = 'DONE: Created ' + codeBlocks.length + ' file(s): ' + Array.from(filesModified).join(', ');
          isDone = true;
          break;
        }

        // Continue the loop to let the model verify or add more
        messages.push({
          role: 'user',
          content: 'I extracted and saved the code from your response. Continue if needed, or say DONE: <summary> to finish.'
        });
        continue;
      }

      // No code blocks and no tool calls — treat as conversational response
      finalSummary = llmResponse.trim();
      isDone = true;
      logger.info('REACT_NO_TOOLS_DONE', { sessionId, iteration, responseLength: finalSummary.length });
      break;
    }

    // Execute each tool call
    for (const toolCall of toolCalls) {
      logger.info('REACT_TOOL_CALL', {
        sessionId,
        iteration,
        tool: toolCall.name,
        args: JSON.stringify(toolCall.args).substring(0, 200)
      });

      // Broadcast tool execution
      broadcastProgress(sessionId, {
        phase: 'react',
        status: 'executing_tool',
        iteration,
        tool: toolCall.name,
        args: toolCall.args
      });
      onProgress({
        phase: 'react',
        status: 'executing_tool',
        iteration,
        tool: toolCall
      });

      // Track file modifications
      if (toolCall.name === 'write_file' || toolCall.name === 'edit_file') {
        if (toolCall.args.path) {
          filesModified.add(toolCall.args.path);
        }
      }

      // Execute the tool
      const toolResult = await executeTool(toolCall.name, toolCall.args);

      // Broadcast tool result
      broadcastProgress(sessionId, {
        phase: 'react',
        status: 'tool_result',
        iteration,
        tool: toolCall.name,
        result: toolResult.substring(0, 500)
      });
      onProgress({
        phase: 'react',
        status: 'tool_result',
        iteration,
        tool: toolCall.name,
        result: toolResult
      });

      // Add the observation to conversation history
      messages.push({
        role: 'user',
        content: `(Tool result for ${toolCall.name}):\n${toolResult}`
      });
    }

    // If done, break out of the loop
    if (isDone) break;
  }

  // If we hit max iterations without DONE
  if (!isDone && !finalSummary) {
    finalSummary = `Reached max iterations (${MAX_ITERATIONS}). Last action may not have completed. Files modified: ${Array.from(filesModified).join(', ') || 'none'}`;
    logger.warn('REACT_MAX_ITERATIONS', { sessionId, iteration });
  }

  // Broadcast completion
  broadcastProgress(sessionId, {
    phase: 'react',
    status: 'complete',
    iteration,
    summary: finalSummary,
    filesModified: Array.from(filesModified)
  });
  onProgress({
    phase: 'react',
    status: 'complete',
    iteration,
    summary: finalSummary,
    filesModified: Array.from(filesModified)
  });

  // Save the summary as an assistant message in the conversation
  try {
    await addConversationMessage(sessionId, 'assistant', finalSummary, {
      type: 'task_complete',
      iterations: iteration,
      filesModified: Array.from(filesModified)
    });
  } catch (e) {
    logger.warn('Failed to save react summary to conversation', { error: e.message });
    // If FK constraint fails (old conversation not in Supabase), try to create it first
    if (e.message.includes('FOREIGN KEY') || e.message.includes('23503')) {
      try {
        await createConversation('default-user', 'web', 'Recovered Conversation');
        await addConversationMessage(sessionId, 'assistant', finalSummary, {
          type: 'task_complete',
          iterations: iteration,
          filesModified: Array.from(filesModified)
        });
        logger.info('Recovered conversation and saved summary', { sessionId });
      } catch (e2) {
        logger.warn('Recovery failed, summary not saved', { error: e2.message });
      }
    }
  }

  // Broadcast the final message
  broadcastMessage(sessionId, {
    role: 'assistant',
    content: finalSummary,
    type: 'task_complete',
    filesModified: Array.from(filesModified)
  });

  // Upload modified files to Supabase for persistent storage (if configured)
  if (isSupabaseConfigured() && filesModified.size > 0) {
    for (const filePath of filesModified) {
      try {
        const result = await uploadToSupabase(filePath, sessionId);
        if (result.success) {
          logger.info('File saved to Supabase', { filePath, url: result.url });
        }
      } catch (e) {
        logger.warn('Failed to upload to Supabase', { filePath, error: e.message });
      }
    }
  }

  logger.info('REACT_LOOP_COMPLETE', {
    sessionId,
    iterations: iteration,
    filesModified: filesModified.size,
    success: isDone
  });

  return {
    success: isDone,
    summary: finalSummary,
    iterations: iteration,
    filesModified: Array.from(filesModified)
  };
}

export default { executeReActLoop, parseToolCalls };
