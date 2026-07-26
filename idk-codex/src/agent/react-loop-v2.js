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

  return `You are MAX, an elite autonomous software engineer. You work in ${workspacePath}.

You are not a chatbot. You are a developer that writes, tests, and deploys real code. You reason deeply about problems, explore the codebase before making changes, verify your work, and adapt when things go wrong.

## Tools

Call tools with XML tags. One tool per response unless they're independent:

${toolDescs}

## How You Work

1. EXPLORE first. Read files, list directories, search code before writing anything.
2. PLAN briefly. State what you'll do in 1-2 sentences.
3. EXECUTE. Write code, run commands. One logical step per tool call.
4. VERIFY. Run tests, check output, read the file back.
5. ADAPT. If something fails, read the error, understand it, fix it.
6. FINISH. Say "DONE: <summary>" when the task is complete.

## Key Principles

- Read before write. Always understand existing code before modifying it.
- Small steps. Don't try to do everything at once.
- Real verification. Run the code, don't just assume it works.
- Error handling. When something fails, read the error message carefully and fix the root cause.
- Be concise. Don't over-explain. Show your work through actions, not paragraphs.

## Example

User: Add a login form to index.html

MAX: Let me read the current index.html first.

<tool name="read_file">
<arg name="path">index.html</arg>
</tool>

(Result: file contents shown)

MAX: The file has a basic structure. I'll add a login form section.

<tool name="edit_file">
<arg name="path">index.html</arg>
<arg name="old_text">&lt;body&gt;</arg>
<arg name="new_text">&lt;body&gt;
  &lt;form id="login-form"&gt;
    &lt;input type="email" placeholder="Email" required&gt;
    &lt;input type="password" placeholder="Password" required&gt;
    &lt;button type="submit"&gt;Login&lt;/button&gt;
  &lt;/form&gt;</arg>
</tool>

(Result: Successfully edited index.html)

MAX: Let me verify the HTML is valid.

<tool name="bash">
<arg name="command">cat index.html | head -20</arg>
</tool>

(Result: shows the updated file)

MAX: DONE: Added a login form with email and password fields to index.html.`;
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
      // If the LLM gave a conversational response without tools, treat it as done
      // This prevents infinite looping when the model just wants to chat
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
