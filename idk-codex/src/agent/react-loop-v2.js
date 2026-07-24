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
import { addMessage } from '../database/queries.js';
import logger from '../utils/logger.js';

const MAX_ITERATIONS = parseInt(process.env.MAX_AGENT_ITERATIONS || '15', 10);
const MAX_THINKING_TOKENS = parseInt(process.env.MAX_THINKING_TOKENS || '2000', 10);
const MAX_ACTION_TOKENS = parseInt(process.env.MAX_ACTION_TOKENS || '6000', 10);

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(workspacePath) {
  const toolDescs = getToolDescriptions();

  return `You are MAX, an autonomous AI coding agent. You work in a sandbox workspace at ${workspacePath}.

You can use tools to interact with the filesystem, run commands, and search the web. When you need to do something, call a tool by writing XML-like tags in your response.

## Available Tools

${toolDescs}

## How to Call Tools

Write your reasoning first, then call a tool using this format:

<tool name="tool_name">
<arg name="param_name">param_value</arg>
</tool>

You can call multiple tools in one response. After each tool call, you'll see the result and can decide what to do next.

## Important Rules

1. **Think before acting.** Explain your reasoning, then call a tool.
2. **One step at a time.** Don't try to do everything in one tool call.
3. **Observe results.** After each tool call, look at the output and decide the next step.
4. **Be precise.** When editing files, use exact text matches.
5. **When done, say "DONE:" followed by a summary.** This signals task completion.

## Example Conversation

User: Create a Python script that prints hello world

MAX: I'll create a Python script that prints hello world.

<tool name="write_file">
<arg name="path">hello.py</arg>
<arg name="content">#!/usr/bin/env python3
"""Hello world script."""

def main():
    print("Hello, World!")

if __name__ == "__main__":
    main()
</arg>
</tool>

(Result: Successfully wrote 150 bytes to hello.py)

MAX: Let me verify the script works by running it.

<tool name="bash">
<arg name="command">python3 hello.py</arg>
</tool>

(Result: Hello, World!)

MAX: DONE: Created hello.py — a Python script that prints "Hello, World!". Verified it works correctly.

## When to Stop

Say "DONE: <summary>" when:
- The task is complete
- You've verified the result works
- You can't make further progress

If you get stuck after several attempts, explain what went wrong and say "DONE: <partial summary>".

Remember: you're working in ${workspacePath}. All file paths are relative to that directory.`;
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

    // Call the LLM
    let llmResponse;
    try {
      const result = await generateCompletion(messages, {
        temperature: 0.3,
        maxTokens: MAX_ACTION_TOKENS
      });
      llmResponse = result?.content || '';
    } catch (err) {
      logger.error('REACT_LLM_ERROR', { iteration, error: err.message });
      finalSummary = `LLM error at iteration ${iteration}: ${err.message}`;
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

    // If no tool calls and not done, prompt the LLM to continue or finish
    if (toolCalls.length === 0 && !isDone) {
      messages.push({
        role: 'user',
        content: 'Please continue working on the task. If you are done, say "DONE: <summary>". If you need to do something, call a tool.'
      });
      continue;
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

  // Save the summary as an assistant message
  try {
    await addMessage(sessionId, 'assistant', finalSummary);
  } catch (e) {
    logger.warn('Failed to save react summary', { error: e.message });
  }

  // Broadcast the final message
  broadcastMessage(sessionId, {
    role: 'assistant',
    content: finalSummary,
    type: 'task_complete'
  });

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
