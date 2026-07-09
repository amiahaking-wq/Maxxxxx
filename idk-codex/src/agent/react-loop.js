/**
 * REACT Agent Loop (Reason + Act)
 *
 * Implements a ReAct (Reasoning and Acting) agent loop that:
 * 1. Reasons about what to do next
 * 2. Selects and executes tools
 * 3. Observes results
 * 4. Repeats until task is complete
 *
 * This is a complete rewrite to use the tool system.
 */

import { generateCompletion } from '../groq/client.js';
import { createAgentRun, updateAgentRun } from '../database/queries.js';
import { addToContext } from './context.js';
import logger from '../utils/logger.js';
import { broadcastProgress } from '../api/websocket.js';
import TokenBudgetManager from '../groq/token-budget.js';
import AgentTerminal from './tools/terminal.js';
import { buildToolRegistry } from './tools/registry.js';
import WorkspaceManager from './workspace/manager.js';

const MAX_ITERATIONS = 20;

/**
 * Execute REACT agent loop with tool system
 * @param {string} task - Task description
 * @param {number} sessionId - Session ID
 * @param {Function} progressCallback - Progress callback function
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Execution result
 */
export async function executeReactAgentLoop(task, sessionId, progressCallback = null, userId = null) {
  logger.info('Starting REACT agent loop', { task, sessionId });

  const budgetManager = new TokenBudgetManager();
  const workspaceManager = new WorkspaceManager(sessionId.toString());

  let terminal = null;
  let tools = null;

  try {
    // Initialize workspace
    await reportProgress('workspace', 'initializing', progressCallback, sessionId);
    const workspacePath = await workspaceManager.init();
    logger.info('Workspace initialized', { workspacePath });

    // Initialize terminal
    await reportProgress('terminal', 'initializing', progressCallback, sessionId);
    terminal = new AgentTerminal(sessionId.toString(), workspacePath, (event, data) => {
      broadcastProgress(sessionId, { event, ...data });
    });
    await terminal.init();
    logger.info('Terminal initialized');

    // Build tool registry
    tools = buildToolRegistry(terminal, workspacePath, (event, data) => {
      broadcastProgress(sessionId, { event, ...data });
      // Also report to Telegram callback
      if (progressCallback && event === 'tool:use') {
        progressCallback({
          phase: 'react',
          status: 'tool_use',
          tool: data.tool,
          details: data
        }).catch(err => logger.warn('Progress callback failed', { error: err.message }));
      }
    });

    // Add user message to context
    await addToContext(sessionId, 'user', task);

    // REACT loop
    const conversationHistory = [];
    let iteration = 0;
    let complete = false;
    let finalAnswer = null;

    conversationHistory.push({
      role: 'user',
      content: task
    });

    await reportProgress('react', 'running', progressCallback, sessionId, {
      iteration: 0,
      maxIterations: MAX_ITERATIONS
    });

    while (!complete && iteration < MAX_ITERATIONS) {
      iteration++;

      logger.info('REACT iteration', { iteration, maxIterations: MAX_ITERATIONS });

      // REASON: Build prompt and get LLM response
      const prompt = buildToolPrompt(task, conversationHistory, tools);

      logger.info('Calling LLM for reasoning', { iteration });

      const response = await generateCompletion(prompt, {
        temperature: 0.4,
        maxTokens: 4000,
        budgetManager
      });

      const responseText = response.content;
      logger.info('LLM response received', {
        iteration,
        length: responseText.length
      });

      conversationHistory.push({
        role: 'assistant',
        content: responseText
      });

      // Parse for tool calls
      const toolCall = extractToolCall(responseText);

      if (toolCall) {
        // ACT: Execute tool
        logger.info('Executing tool', {
          iteration,
          tool: toolCall.tool,
          input: toolCall.input
        });

        await reportProgress('react', 'tool_executing', progressCallback, sessionId, {
          iteration,
          tool: toolCall.tool,
          input: toolCall.input
        });

        const runId = createAgentRun(sessionId, 'react_tool', {
          iteration,
          tool: toolCall.tool
        });

        try {
          const result = await tools[toolCall.tool](toolCall.input);

          updateAgentRun(runId, 'success', null, iteration);

          logger.info('Tool executed successfully', {
            iteration,
            tool: toolCall.tool,
            success: result.success
          });

          // Add tool result to conversation
          conversationHistory.push({
            role: 'user',
            content: `Tool: ${toolCall.tool}\nResult: ${JSON.stringify(result, null, 2)}`
          });

          await reportProgress('react', 'tool_complete', progressCallback, sessionId, {
            iteration,
            tool: toolCall.tool,
            result
          });

          // Check if tool execution failed
          if (result.success === false) {
            logger.warn('Tool execution failed', {
              iteration,
              tool: toolCall.tool,
              error: result.error
            });
          }
        } catch (error) {
          updateAgentRun(runId, 'failed', error.message, iteration);

          logger.error('Tool execution error', {
            iteration,
            tool: toolCall.tool,
            error: error.message
          });

          // Add error to conversation
          conversationHistory.push({
            role: 'user',
            content: `Tool: ${toolCall.tool}\nError: ${error.message}`
          });
        }
      } else {
        // No tool call - check if this is final answer
        if (responseText.toLowerCase().includes('task complete') ||
            responseText.toLowerCase().includes('finished') ||
            responseText.toLowerCase().includes('done') ||
            iteration >= MAX_ITERATIONS - 1) {
          complete = true;
          finalAnswer = responseText;

          logger.info('REACT loop complete', {
            iteration,
            reason: iteration >= MAX_ITERATIONS - 1 ? 'max iterations' : 'task complete'
          });

          await reportProgress('react', 'complete', progressCallback, sessionId, {
            iteration,
            finalAnswer: finalAnswer.substring(0, 500)
          });
        } else {
          // LLM didn't call a tool or finish - prompt it to continue
          conversationHistory.push({
            role: 'user',
            content: 'Please continue with the task. Use a tool or indicate task completion.'
          });
        }
      }

      // Check budget and prevent infinite loops
      if (budgetManager.shouldTriggerHandoff()) {
        logger.warn('Token budget exceeded, stopping REACT loop');
        complete = true;
        finalAnswer = 'Token budget exceeded. Task partially complete.';
      }

      await reportProgress('react', 'iteration_complete', progressCallback, sessionId, {
        iteration,
        totalIterations: MAX_ITERATIONS
      });
    }

    // Save final response to context
    if (finalAnswer) {
      await addToContext(sessionId, 'assistant', finalAnswer);
    }

    // Cleanup
    if (terminal) {
      await terminal.kill();
    }

    logger.info('REACT loop completed successfully', {
      sessionId,
      iterations: iteration,
      budgetUsage: budgetManager.getUsageSummary()
    });

    return {
      success: complete,
      iterations: iteration,
      finalAnswer,
      budgetUsage: budgetManager.getUsageSummary(),
      conversationHistory: conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content.substring(0, 200)
      }))
    };
  } catch (error) {
    logger.error('REACT loop failed', { error: error.message, sessionId });

    // Cleanup
    if (terminal) {
      try {
        await terminal.kill();
      } catch (err) {
        logger.warn('Failed to kill terminal', { error: err.message });
      }
    }

    await reportProgress('react', 'failed', progressCallback, sessionId, {
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      iterations: 0
    };
  }
}

/**
 * Build prompt for tool-using agent
 * @param {string} task - Original task
 * @param {Array} history - Conversation history
 * @param {Object} tools - Tool registry
 * @returns {Array} Messages array for LLM
 */
function buildToolPrompt(task, history, tools) {
  const toolDescriptions = Object.keys(tools).map(toolName => {
    const descriptions = {
      read_file: 'Read contents of a file. Input: {path: string}',
      write_file: 'Write contents to a file. Input: {path: string, content: string}',
      edit_file: 'Edit file by replacing text. Input: {path: string, oldStr: string, newStr: string}',
      run_command: 'Run shell command. Input: {command: string, timeout?: number}',
      list_files: 'List files in directory. Input: {path?: string, pattern?: string}',
      search_code: 'Search code for pattern. Input: {query: string, path?: string, fileType?: string}',
      install_package: 'Install packages. Input: {packages: string[], manager?: string}',
      run_tests: 'Run test suite. Input: {command?: string, path?: string}',
      git_operations: 'Git operations. Input: {operation: string, files?: string[], message?: string}',
      create_directory: 'Create directory. Input: {path: string}',
      web_fetch: 'Fetch web content. Input: {url: string, type?: string}',
      check_syntax: 'Check code syntax. Input: {path: string}'
    };

    return `- ${toolName}: ${descriptions[toolName] || 'Available tool'}`;
  }).join('\n');

  const systemPrompt = `You are an autonomous software development agent. Your task is to complete the user's request by reasoning and using available tools.

AVAILABLE TOOLS:
${toolDescriptions}

INSTRUCTIONS:
1. Analyze the task and determine what needs to be done
2. Use tools to gather information, make changes, or execute commands
3. To use a tool, respond with JSON: {"tool": "tool_name", "input": {...}}
4. After using a tool, you'll receive the result and can continue
5. When task is complete, respond with "TASK COMPLETE: " followed by a summary
6. Always explain your reasoning before using a tool
7. Use tools one at a time, don't try to use multiple tools in one response
8. If you encounter errors, analyze them and try a different approach

IMPORTANT RULES:
- Always use absolute paths for file operations
- Validate inputs before using tools
- Check file contents before editing
- Run tests after making changes
- Use git operations to track changes
- Explain your thought process

Example response format:
Thought: I need to read the package.json to understand the project structure.
{"tool": "read_file", "input": {"path": "package.json"}}

When done:
TASK COMPLETE: Successfully completed the task. [Brief summary of what was done]`;

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    ...history
  ];

  return messages;
}

/**
 * Extract tool call from LLM response
 * @param {string} text - LLM response text
 * @returns {Object|null} {tool, input} or null
 */
function extractToolCall(text) {
  try {
    // Look for JSON object in the response
    const jsonMatch = text.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.tool && parsed.input) {
      return {
        tool: parsed.tool,
        input: parsed.input
      };
    }

    return null;
  } catch (error) {
    logger.debug('Failed to parse tool call', { error: error.message });
    return null;
  }
}

/**
 * Report progress to callback and WebSocket
 * @param {string} phase - Phase name
 * @param {string} status - Status
 * @param {Function} callback - Progress callback
 * @param {number} sessionId - Session ID
 * @param {Object} data - Additional data
 */
async function reportProgress(phase, status, callback, sessionId = null, data = {}) {
  // Call the callback for Telegram notifications
  if (callback && typeof callback === 'function') {
    try {
      await callback({ phase, status, ...data });
    } catch (error) {
      logger.warn('Progress callback failed', { error: error.message });
    }
  }

  // Broadcast to WebSocket clients for web UI
  if (sessionId) {
    try {
      broadcastProgress(sessionId, {
        phase,
        status,
        ...data
      });
    } catch (error) {
      logger.warn('WebSocket broadcast failed', { error: error.message });
    }
  }
}

export default executeReactAgentLoop;
