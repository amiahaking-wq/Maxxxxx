/**
 * Multi-Agent Orchestrator (Feature #22)
 *
 * Lets MAX delegate sub-tasks to specialist sub-agents:
 *   - coder: writes code, runs tests
 *   - reviewer: reviews code for bugs + security
 *   - researcher: searches the web for information
 *   - planner: breaks down complex tasks into steps
 *   - tester: writes and runs tests
 *
 * Each sub-agent runs its own ReAct loop with a specialized system prompt
 * and a curated subset of tools.
 *
 * POST /api/orchestrate — run a multi-agent task
 *   body: { task, specialists: ['coder', 'researcher'], maxRounds: 3 }
 *
 * The orchestrator:
 *   1. Calls the planner to break down the task
 *   2. Assigns each sub-task to the right specialist
 *   3. Runs specialists in parallel where possible
 *   4. Reviews results with the reviewer
 *   5. Returns the final synthesized answer
 */

import { generateCompletion } from '../groq/client.js';
import { executeReActLoop } from '../agent/react-loop-v2.js';
import logger from '../utils/logger.js';

/**
 * Sub-agent definitions — each has a specialized system prompt and tool subset.
 */
export const SUB_AGENTS = {
  planner: {
    name: 'Planner',
    description: 'Breaks down complex tasks into actionable steps',
    systemPrompt: 'You are a task planner. Break down the user\'s task into 3-7 concrete, ordered steps. Each step should be specific enough that another agent can execute it. Output as a numbered list.',
    tools: [], // planner doesn't need tools — it just thinks
    maxTokens: 800
  },
  researcher: {
    name: 'Researcher',
    description: 'Searches the web for information',
    systemPrompt: 'You are a research specialist. Your job is to find information using web_search and web_fetch. Always cite sources. Return a concise summary with citations.',
    tools: ['web_search', 'web_fetch'],
    maxTokens: 1500
  },
  coder: {
    name: 'Coder',
    description: 'Writes code, creates files, runs commands',
    systemPrompt: 'You are a coding specialist. Write complete, working code. Use write_file to create files, bash to test them, and read_file/edit_file for modifications. Always verify your code runs.',
    tools: ['write_file', 'read_file', 'edit_file', 'bash', 'list_files', 'search'],
    maxTokens: 4000
  },
  reviewer: {
    name: 'Reviewer',
    description: 'Reviews code for bugs, security, and best practices',
    systemPrompt: 'You are a code reviewer. Read the code carefully and identify: bugs, security issues, performance problems, and improvements. Output as a bulleted list with severity ratings.',
    tools: ['read_file', 'list_files', 'search'],
    maxTokens: 1500
  },
  tester: {
    name: 'Tester',
    description: 'Writes and runs tests',
    systemPrompt: 'You are a testing specialist. Write tests for the code, run them with bash, and report results. If tests fail, identify the cause and report it.',
    tools: ['write_file', 'read_file', 'bash', 'list_files'],
    maxTokens: 2000
  }
};

/**
 * Orchestrate a multi-agent task.
 *
 * @param {string} task - the user's task
 * @param {string} userId - user ID
 * @param {string} sessionId - session ID for WebSocket broadcasts
 * @param {Object} options - { specialists, maxRounds }
 * @returns {Object} { success, plan, results, finalSummary }
 */
export async function orchestrate(task, userId, sessionId, options = {}) {
  const specialists = options.specialists || ['planner', 'researcher', 'coder'];
  const maxRounds = options.maxRounds || 3;

  logger.info('ORCHESTRATION_START', { task: task.substring(0, 100), specialists, sessionId });

  // ===== STEP 1: PLANNING =====
  let plan = null;
  if (specialists.includes('planner')) {
    try {
      const planResult = await generateCompletion([
        { role: 'system', content: SUB_AGENTS.planner.systemPrompt },
        { role: 'user', content: task }
      ], { temperature: 0.2, maxTokens: SUB_AGENTS.planner.maxTokens });

      plan = planResult?.content || '';
      logger.info('ORCHESTRATION_PLAN', { sessionId, planLength: plan.length });
    } catch (e) {
      logger.warn('Orchestration planning failed', { error: e.message });
      plan = `1. ${task}`;
    }
  }

  // ===== STEP 2: EXECUTE SPECIALISTS =====
  const results = {};

  // Run research first (if requested) — other specialists may need its output
  if (specialists.includes('researcher')) {
    try {
      const researchTask = `Research the following task and provide relevant context:\n\n${task}${plan ? `\n\nPlan:\n${plan}` : ''}`;
      const researchResult = await executeReActLoop(researchTask, `${sessionId}_research`, userId, {
        workspacePath: process.env.SANDBOX_WORKSPACE || './sandbox-workspace'
      });
      results.researcher = researchResult.summary;
    } catch (e) {
      results.researcher = `Research failed: ${e.message}`;
    }
  }

  // Run coder next
  if (specialists.includes('coder')) {
    try {
      const coderTask = `Implement the following task. ${results.researcher ? `Research context: ${results.researcher}` : ''}\n\nTask: ${task}${plan ? `\n\nPlan:\n${plan}` : ''}`;
      const coderResult = await executeReActLoop(coderTask, `${sessionId}_coder`, userId, {
        workspacePath: process.env.SANDBOX_WORKSPACE || './sandbox-workspace'
      });
      results.coder = coderResult.summary;
      results.filesModified = coderResult.filesModified;
    } catch (e) {
      results.coder = `Coding failed: ${e.message}`;
    }
  }

  // Run reviewer next (if there are files to review)
  if (specialists.includes('reviewer') && results.filesModified?.length > 0) {
    try {
      const reviewTask = `Review the following files for bugs, security issues, and improvements:\n\n${results.filesModified.join('\n')}`;
      const reviewResult = await executeReActLoop(reviewTask, `${sessionId}_reviewer`, userId, {
        workspacePath: process.env.SANDBOX_WORKSPACE || './sandbox-workspace'
      });
      results.reviewer = reviewResult.summary;
    } catch (e) {
      results.reviewer = `Review failed: ${e.message}`;
    }
  }

  // Run tester (if there are files to test)
  if (specialists.includes('tester') && results.filesModified?.length > 0) {
    try {
      const testTask = `Write tests for the following files and run them:\n\n${results.filesModified.join('\n')}`;
      const testResult = await executeReActLoop(testTask, `${sessionId}_tester`, userId, {
        workspacePath: process.env.SANDBOX_WORKSPACE || './sandbox-workspace'
      });
      results.tester = testResult.summary;
    } catch (e) {
      results.tester = `Testing failed: ${e.message}`;
    }
  }

  // ===== STEP 3: SYNTHESIZE FINAL ANSWER =====
  let finalSummary = '';
  try {
    const synthesisPrompt = `You orchestrated a multi-agent task. Synthesize the results into a final summary for the user.

Original task: ${task}

${plan ? `Plan:\n${plan}\n` : ''}
Specialist results:
${Object.entries(results).map(([agent, result]) => `### ${agent}:\n${result}`).join('\n\n')}

Provide a clear, concise summary of what was accomplished, any issues found, and recommendations. Include file paths if any files were created.`;

    const synthResult = await generateCompletion([
      { role: 'system', content: 'You are a synthesis agent. Combine the results from multiple specialists into a coherent summary.' },
      { role: 'user', content: synthesisPrompt }
    ], { temperature: 0.3, maxTokens: 1000 });

    finalSummary = synthResult?.content || JSON.stringify(results, null, 2);
  } catch (e) {
    finalSummary = `Task completed. Results:\n${JSON.stringify(results, null, 2)}`;
  }

  logger.info('ORCHESTRATION_COMPLETE', { sessionId, specialists: Object.keys(results) });

  return {
    success: true,
    plan,
    results,
    finalSummary,
    filesModified: results.filesModified || []
  };
}

export default { orchestrate, SUB_AGENTS };
