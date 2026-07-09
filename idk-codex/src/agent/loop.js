import { executePlanPhase } from './phases/plan.js';
import { executeExecutePhase } from './phases/execute.js';
import { executeTestPhase } from './phases/test.js';
import { executeDeployPhase } from './phases/deploy.js';
import { executeMonitorPhase } from './phases/monitor.js';
import { fixErrors } from '../groq/client.js';
import { buildErrorContext } from '../groq/prompts.js';
import { createAgentRun, updateAgentRun, getAndResumeHandoff } from '../database/queries.js';
import { addToContext } from './context.js';
import { readFileSafe, existsSafe } from '../utils/filesystem.js';
import logger from '../utils/logger.js';
import { broadcastProgress } from '../api/websocket.js';
import { spawn } from 'child_process';

// V2 Enhancements
import TokenBudgetManager from '../groq/token-budget.js';
import { shouldTriggerHandoff, createHandoffSnapshot, loadLatestHandoff, resumeHandoff } from './handoff.js';
import { findKnownFix, learnFromSuccess, generateErrorSignature } from './error-learning.js';
import { writePhaseNote, writeSessionSummary } from '../utils/obsidian.js';

// V3: SOP Integration
import { executeWithSOP, isSOPEnabled } from './sop-integration.js';

// V4: Cognitive Reflection System
import { CognitiveReflectionLoop } from './reflection/cognitive-loop.js';

// V5: REACT Agent Loop (Tool System)
import { executeReactAgentLoop } from './react-loop.js';

const MAX_RETRY_COUNT = parseInt(process.env.MAX_RETRY_COUNT || '10', 10);

/**
 * Check if error is recoverable via retry
 * @param {string} error - Error message
 * @returns {boolean} - True if error is recoverable
 */
function isRecoverableError(error) {
  const nonRecoverable = [
    'EACCES',           // Permission denied
    'ENOENT',           // File not found (workspace issue)
    'MODULE_NOT_FOUND', // Dependency missing (need npm install)
    'SyntaxError'       // Code syntax error (need code fix)
  ];
  return !nonRecoverable.some(pattern => error.includes(pattern));
}

/**
 * Verify environment is ready for execution
 * @param {Array} filesModified - List of modified files
 * @returns {Promise<boolean>} - True if environment is ready
 */
async function verifyEnvironment(filesModified) {
  const hasPackageJson = filesModified.some(f => f.includes('package.json'));
  if (hasPackageJson || await existsSafe('package.json')) {
    // Check if node_modules exists
    if (!await existsSafe('node_modules')) {
      logger.info('Installing dependencies before execution');
      try {
        await new Promise((resolve, reject) => {
          const npmInstall = spawn('npm', ['install'], {
            cwd: process.env.SANDBOX_WORKSPACE || process.cwd(),
            timeout: 120000
          });

          npmInstall.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`npm install failed with code ${code}`));
            }
          });

          npmInstall.on('error', (error) => {
            reject(error);
          });
        });
        return true;
      } catch (error) {
        logger.error('Failed to install dependencies', { error: error.message });
        return false;
      }
    }
  }
  return true;
}

/**
 * Execute complete agent loop with self-healing
 * @param {string} task - Task description
 * @param {number} sessionId - Session ID
 * @param {Function} progressCallback - Progress callback function
 * @returns {Promise<Object>} Final result
 */
export async function executeAgentLoop(task, sessionId, progressCallback = null, userId = null) {
  try {
    logger.info('Starting agent loop', { task, sessionId });

    // V2: Initialize token budget manager
    const budgetManager = new TokenBudgetManager();

  // V4: Initialize Cognitive Reflection Loop
  const cognitiveLoop = new CognitiveReflectionLoop(
    process.env.SANDBOX_WORKSPACE,
    budgetManager
  );

  // V4: Cognitive Reflection - Step 1: Pushback & Clarification
  const clarificationCheck = await cognitiveLoop.pushback.analyzePrompt(task, budgetManager);

  if (clarificationCheck.needsClarification && process.env.ENABLE_PUSHBACK_ENGINE !== 'false') {
    logger.info('Task needs clarification, generating menu');

    const menu = await cognitiveLoop.pushback.generateClarificationMenu(
      task,
      clarificationCheck.analysis,
      budgetManager
    );

    // Add clarification menu to context
    await addToContext(sessionId, 'assistant', menu);

    return {
      needsClarification: true,
      clarificationMenu: menu,
      analysis: clarificationCheck.analysis,
      success: false
    };
  }

  // V5: Try REACT agent loop if enabled
  if (process.env.ENABLE_REACT_MODE === 'true') {
    logger.info('REACT mode enabled, using tool-based agent loop');
    const reactResult = await executeReactAgentLoop(task, sessionId, progressCallback, userId);

    if (reactResult && reactResult.success) {
      logger.info('REACT execution completed successfully');
      return reactResult;
    } else if (reactResult && !reactResult.success) {
      logger.warn('REACT execution failed, falling back to standard loop', {
        error: reactResult.error
      });
      // Fall through to standard loop
    }
  }

  // V3: Try SOP execution if enabled
  if (isSOPEnabled()) {
    logger.info('SOP system enabled, attempting SOP execution');
    const sopResult = await executeWithSOP(task, sessionId, progressCallback, userId);

    if (sopResult && sopResult.success) {
      logger.info('SOP execution completed successfully');
      return sopResult;
    } else if (sopResult && !sopResult.success) {
      logger.warn('SOP execution failed, falling back to standard loop', {
        error: sopResult.error
      });
      // Fall through to standard loop
    }
  }

  // V2: Check for pending handoff (atomic operation to prevent race condition)
  const pendingHandoff = await getAndResumeHandoff(sessionId);
  if (pendingHandoff) {
    logger.info('Pending handoff found, resuming session', {
      sessionId,
      handoffId: pendingHandoff.id,
      retryCount: pendingHandoff.retry_count
    });
    // Restore budget usage
    budgetManager.currentInput = pendingHandoff.token_usage_input || 0;
    budgetManager.currentOutput = pendingHandoff.token_usage_output || 0;
  }

    const results = {
      plan: null,
      execute: null,
      test: null,
      deploy: null,
      monitor: null,
      retryCount: 0,
      success: false,
      budgetUsage: null // V2: Track budget
    };

    // Add user message to context
    await addToContext(sessionId, 'user', task);

    // PHASE 1: PLAN
    try {
      await reportProgress('plan', 'running', progressCallback, sessionId);
      const planRunId = createAgentRun(sessionId, 'plan');

      results.plan = await executePlanPhase(task, budgetManager);

      if (!results.plan.success) {
        updateAgentRun(planRunId, 'failed', results.plan.error);
        await reportProgress('plan', 'failed', progressCallback, sessionId, results.plan);
        return results;
      }

      updateAgentRun(planRunId, 'success');
      await reportProgress('plan', 'success', progressCallback, sessionId, results.plan);

      // V2: Write phase note to Obsidian (fire-and-forget)
      writePhaseNote(sessionId, 'plan', results.plan).catch(err =>
        logger.warn('Failed to write plan phase note', { error: err.message })
      );
    } catch (error) {
      logger.error('Plan phase failed', { error: error.message, stack: error.stack });
      throw error;
    }

    // Self-healing loop for EXECUTE and TEST phases
    let healingAttempt = 0;
    let executeSuccess = false;
    let lastError = null;

    while (healingAttempt < MAX_RETRY_COUNT && !executeSuccess) {
      // V2: Check for handoff trigger before phase
      if (shouldTriggerHandoff(budgetManager, healingAttempt)) {
        logger.info('Handoff triggered, creating snapshot');
        const handoff = await createHandoffSnapshot(
          sessionId,
          {
            task,
            currentPhase: 'execute',
            plan: results.plan?.plan,
            filesModified: results.execute?.filesModified || []
          },
          budgetManager,
          healingAttempt,
          lastError
        );

        results.handoffTriggered = true;
        results.handoffId = handoff.id;
        await reportProgress('handoff', 'created', progressCallback, sessionId, { handoffId: handoff.id });
        return results;
      }

      // PHASE 2: EXECUTE
      try {
        logger.info(`Agent phase: execute (attempt ${healingAttempt + 1}/${MAX_RETRY_COUNT})`);

        // Verify environment before execution
        const envReady = await verifyEnvironment(results.plan?.filesModified || []);
        if (!envReady) {
          logger.error('Environment verification failed');
          lastError = 'Environment verification failed - missing dependencies';
          healingAttempt++;
          continue;
        }

        await reportProgress('execute', 'running', progressCallback, sessionId, { attempt: healingAttempt + 1 });
        const executeRunId = createAgentRun(sessionId, 'execute', { attempt: healingAttempt + 1 });

        results.execute = await executeExecutePhase(
          results.plan.plan,
          task,
          { attempt: healingAttempt, budgetManager, sessionId }
        );

        if (!results.execute.success) {
          updateAgentRun(executeRunId, 'failed', results.execute.error, healingAttempt);
          lastError = results.execute.error;

          // Check if error is recoverable
          if (!isRecoverableError(results.execute.error)) {
            logger.error('Non-recoverable error detected, halting retry loop', {
              error: results.execute.error,
              attempt: healingAttempt
            });
            break; // Exit retry loop
          }

          // Apply exponential backoff BEFORE retry
          const backoffMs = Math.min(2000 * Math.pow(2, healingAttempt), 30000);
          logger.info('Backing off before execute retry', { backoffMs, attempt: healingAttempt });
          await new Promise(resolve => setTimeout(resolve, backoffMs));

          healingAttempt++;
          continue;
        }

        updateAgentRun(executeRunId, 'success', null, healingAttempt);
        await reportProgress('execute', 'success', progressCallback, sessionId, results.execute);

        // V2: Write phase note to Obsidian (fire-and-forget)
        writePhaseNote(sessionId, 'execute', results.execute).catch(err =>
          logger.warn('Failed to write execute phase note', { error: err.message })
        );
      } catch (error) {
        logger.error('Execute phase failed', { error: error.message, stack: error.stack });
        throw error;
      }

      // PHASE 3: TEST
      try {
        await reportProgress('test', 'running', progressCallback, sessionId);
        const testRunId = createAgentRun(sessionId, 'test');

        results.test = await executeTestPhase(results.execute, { sessionId });

        if (!results.test.success && !results.test.skipped) {
          updateAgentRun(testRunId, 'failed', results.test.error, healingAttempt);
          await reportProgress('test', 'failed', progressCallback, sessionId, results.test);

          // Enter self-healing mode
          logger.info('Entering self-healing mode', {
            attempt: healingAttempt + 1,
            maxRetries: MAX_RETRY_COUNT
          });

          if (healingAttempt < MAX_RETRY_COUNT - 1) {
            // V2: Pass budgetManager to healSelf
            await healSelf(results, task, healingAttempt, budgetManager);
            healingAttempt++;
            results.retryCount = healingAttempt;
            await reportProgress('healing', 'running', progressCallback, sessionId, {
              attempt: healingAttempt,
              maxRetries: MAX_RETRY_COUNT
            });
            continue;
          } else {
            logger.error('Max retries reached', { retryCount: healingAttempt });
            return results;
          }
        }

        updateAgentRun(testRunId, 'success', null, healingAttempt);
        await reportProgress('test', 'success', progressCallback, sessionId, results.test);

        // V2: Learn from successful error fix
        if (results._pendingErrorLearning && process.env.ERROR_LEARNING_ENABLED !== 'false') {
          const { errorSig, errorMessage, fixDescription } = results._pendingErrorLearning;
          try {
            await learnFromSuccess(errorMessage, fixDescription);
            logger.info('Learned from successful error fix', { errorSig });
            delete results._pendingErrorLearning;
          } catch (error) {
            logger.warn('Failed to learn from success', { error: error.message });
          }
        }

        // V2: Write phase note to Obsidian (fire-and-forget)
        writePhaseNote(sessionId, 'test', results.test).catch(err =>
          logger.warn('Failed to write test phase note', { error: err.message })
        );

        executeSuccess = true;
      } catch (error) {
        logger.error('Test phase failed', { error: error.message, stack: error.stack });
        throw error;
      }
    }

    if (!executeSuccess) {
      logger.error('Failed to execute successfully after retries');
      return results;
    }

    // V4: Cognitive Reflection - Step 2: Auto-Validation
    if (process.env.ENABLE_AUTO_VALIDATION !== 'false' && results.execute?.filesModified?.length > 0) {
      logger.info('Running auto-validation on modified files');

      const validation = await cognitiveLoop.validator.validateFiles(
        results.execute.filesModified,
        budgetManager
      );

      if (!validation.allValid) {
        logger.error('Auto-validation failed', {
          failedCount: validation.results.filter(r => !r.valid && !r.skipped).length
        });

        results.validation = validation;
        results.validationFailed = true;

        await reportProgress('validation', 'failed', progressCallback, sessionId, { validation });

        // Don't proceed to deploy if validation fails
        return results;
      }

      logger.info('Auto-validation passed', {
        validatedFiles: validation.results.length,
        selfCorrected: validation.results.filter(r => r.selfCorrected).length
      });

      results.validation = validation;
      await reportProgress('validation', 'success', progressCallback, sessionId, { validation });
    }

    // PHASE 4: DEPLOY
    try {
      await reportProgress('deploy', 'running', progressCallback, sessionId);
      const deployRunId = createAgentRun(sessionId, 'deploy');

      results.deploy = await executeDeployPhase(results.execute, results.test, { budgetManager, userId, sessionId });

      if (!results.deploy.success) {
        updateAgentRun(deployRunId, 'failed', results.deploy.error);
        await reportProgress('deploy', 'failed', progressCallback, sessionId, results.deploy);
        return results;
      }

      updateAgentRun(deployRunId, 'success');
      await reportProgress('deploy', 'success', progressCallback, sessionId, results.deploy);

      // V2: Write phase note to Obsidian (fire-and-forget)
      writePhaseNote(sessionId, 'deploy', results.deploy).catch(err =>
        logger.warn('Failed to write deploy phase note', { error: err.message })
      );
    } catch (error) {
      logger.error('Deploy phase failed', { error: error.message, stack: error.stack });
      throw error;
    }

    // PHASE 5: MONITOR
    try {
      await reportProgress('monitor', 'running', progressCallback, sessionId);
      const monitorRunId = createAgentRun(sessionId, 'monitor');

      results.monitor = await executeMonitorPhase(results.deploy, {
        timeoutMs: 300000, // 5 minutes
        pollIntervalMs: 20000 // 20 seconds
      });

      if (!results.monitor.success && !results.monitor.skipped) {
        updateAgentRun(monitorRunId, 'failed', results.monitor.error);
        await reportProgress('monitor', 'failed', progressCallback, sessionId, results.monitor);
        return results;
      }

      updateAgentRun(monitorRunId, 'success');
      await reportProgress('monitor', 'success', progressCallback, sessionId, results.monitor);

      // V2: Write phase note to Obsidian (fire-and-forget)
      writePhaseNote(sessionId, 'monitor', results.monitor).catch(err =>
        logger.warn('Failed to write monitor phase note', { error: err.message })
      );
    } catch (error) {
      logger.error('Monitor phase failed', { error: error.message, stack: error.stack });
      throw error;
    }

    // Overall success
    results.success = true;
    results.budgetUsage = budgetManager.getUsageSummary();

    // Emit completion token for auto-archive
    results.completionToken = '<promise>COMPLETE</promise>';
    logger.info('Task completion protocol activated', { sessionId });

    // V4: Cognitive Reflection - Step 3: Architecture Documentation
    if (process.env.ENABLE_ARCH_DOCUMENTATION !== 'false') {
      logger.info('Documenting architecture');

      const docResult = await cognitiveLoop.archWriter.documentDecision(
        task,
        {
          plan: results.plan?.plan,
          modifiedFiles: results.execute?.filesModified || [],
          validation: results.validation,
          deploy: results.deploy,
          retryCount: healingAttempt
        },
        results.plan?.reasoning || 'Implementation completed successfully',
        budgetManager
      );

      if (docResult.success) {
        logger.info('Architecture documented', { path: docResult.filePath });
        results.architectureDocumented = true;
        results.architectureDocPath = docResult.filePath;
      } else {
        logger.warn('Failed to document architecture', { error: docResult.error });
      }
    }

    logger.info('Agent loop completed successfully', {
      sessionId,
      retryCount: healingAttempt,
      budgetUsage: results.budgetUsage,
      architectureDocumented: results.architectureDocumented || false
    });

    // GITHUB AUTO-COMMIT: After successful task completion
    if (results.success && process.env.AUTO_COMMIT_FIXES === 'true') {
      try {
        const connector = await import('./github-connector.js');
        const filesModified = results.execute?.filesModified || [];

        if (filesModified.length > 0) {
          const autoCommitMessage = `MAX Auto-commit: ${task}\n\nCompleted by MAX Agent autonomous execution\n- Plan phase: ${results.plan?.success ? 'Success' : 'Failed'}\n- Execute phase: ${results.execute?.success ? 'Success' : 'Failed'}\n- Test phase: ${results.test?.success ? 'Success' : 'Failed'}`;

          const pushResult = await connector.commitAndPushChanges(
            sessionId,
            filesModified,
            autoCommitMessage,
            { coAuthor: 'MAX Agent <max@autonomous-agent.dev>' }
          );

          logger.info('Auto-commit completed', { success: pushResult.success });
        }
      } catch (error) {
        logger.warn('Auto-commit failed (non-fatal)', { error: error.message });
      }
    }

    // V2: Write session summary to Obsidian (fire-and-forget)
    writeSessionSummary(sessionId, results).catch(err =>
      logger.warn('Failed to write session summary', { error: err.message })
    );

    return results;
  } catch (error) {
    logger.error('Agent loop failed', { error: error.message, sessionId, stack: error.stack });
    throw error;
  }
}

/**
 * Self-healing: fix errors and update implementation
 * V2 Enhanced: Uses error pattern learning
 * @param {Object} results - Current results
 * @param {string} task - Original task
 * @param {number} retryCount - Current retry count
 * @param {Object} budgetManager - Token budget manager
 */
async function healSelf(results, task, retryCount, budgetManager = null) {
  try {
    logger.info('Attempting self-heal', { retryCount });

    // Get the error information
    const errorInfo = {
      exitCode: results.test.exitCode,
      stdout: results.test.stdout,
      stderr: results.test.stderr
    };

    const errorMessage = `${errorInfo.stderr}\n\nStdout:\n${errorInfo.stdout}`;

    // V2: Generate error signature for learning
    const errorSig = generateErrorSignature(errorMessage);

    // V2: Check if we have a known fix for this error
    const knownFix = await findKnownFix(errorMessage);

    if (knownFix && process.env.ERROR_LEARNING_ENABLED !== 'false') {
      logger.info('Applying known fix', {
        errorType: knownFix.errorType,
        confidence: knownFix.confidence,
        successCount: knownFix.successCount
      });

      // Apply the known fix description to the plan
      for (const file of results.execute.filesModified || []) {
        const step = results.plan.plan.steps.find(s => s.file === file);
        if (step) {
          step.description = `${knownFix.fixDescription} (known fix, confidence: ${knownFix.confidence})`;
        }
      }
    } else {
      // For each modified file, attempt to fix using AI
      let fixApplied = false;

      for (const file of results.execute.filesModified || []) {
        try {
          // Read current code
          const currentCode = await readFileSafe(file);

          // Generate fix using AI
          const fixedCode = await fixErrors(currentCode, errorMessage, retryCount, budgetManager);

          // Update the plan with fixed code approach
          const step = results.plan.plan.steps.find(s => s.file === file);
          if (step) {
            step.description = `Fix errors in ${file}: ${errorInfo.stderr.substring(0, 200)}`;
          }

          fixApplied = true;
          logger.info('Generated fix for file', { file, retryCount });
        } catch (error) {
          logger.error('Failed to generate fix', { file, error: error.message });
        }
      }

      // V2: If fix was applied and error learning is enabled, prepare to learn from success
      if (fixApplied) {
        // We'll learn from success after the next successful test
        results._pendingErrorLearning = {
          errorSig,
          errorMessage,
          fixDescription: `AI-generated fix attempt ${retryCount + 1}`
        };
      }
    }

    // Wait a bit before retry (exponential backoff)
    const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 10000);
    await new Promise(resolve => setTimeout(resolve, backoffMs));
  } catch (error) {
    logger.error('Self-healing failed', { error: error.message });
    // Cleanup to prevent memory leak
    if (results._pendingErrorLearning) {
      delete results._pendingErrorLearning;
    }
  }
}

/**
 * Report progress to callback
 * @param {string} phase - Phase name
 * @param {string} status - Phase status
 * @param {Function} callback - Callback function
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

/**
 * Format loop results for display
 * @param {Object} results - Loop results
 * @returns {string} Formatted results
 */
export function formatLoopResults(results) {
  let text = '<b>Agent Execution Results</b>\n\n';

  // Plan
  if (results.plan) {
    text += `✓ <b>Plan</b>: ${results.plan.success ? 'Success' : 'Failed'}\n`;
    if (results.plan.success) {
      text += `  - Steps: ${results.plan.plan.steps.length}\n`;
      text += `  - Complexity: ${results.plan.plan.estimated_complexity}\n`;
    }
  }

  // Execute
  if (results.execute) {
    text += `${results.execute.success ? '✓' : '✗'} <b>Execute</b>: ${results.execute.success ? 'Success' : 'Failed'}\n`;
    if (results.execute.filesModified) {
      text += `  - Files modified: ${results.execute.filesModified.length}\n`;
    }
  }

  // Test
  if (results.test) {
    if (results.test.skipped) {
      text += `⊘ <b>Test</b>: Skipped\n`;
    } else {
      text += `${results.test.success ? '✓' : '✗'} <b>Test</b>: ${results.test.success ? 'Passed' : 'Failed'}\n`;
      if (results.test.insights) {
        text += `  - Tests: ${results.test.insights.passedTests}/${results.test.insights.totalTests} passed\n`;
      }
    }
  }

  // Deploy
  if (results.deploy) {
    if (results.deploy.skipped) {
      text += `⊘ <b>Deploy</b>: Skipped\n`;
    } else {
      text += `${results.deploy.success ? '✓' : '✗'} <b>Deploy</b>: ${results.deploy.success ? 'Success' : 'Failed'}\n`;
      if (results.deploy.commit) {
        text += `  - Commit: ${results.deploy.commit.hash.substring(0, 7)}\n`;
      }
    }
  }

  // Monitor
  if (results.monitor) {
    if (results.monitor.skipped) {
      text += `⊘ <b>Monitor</b>: Skipped\n`;
    } else {
      text += `${results.monitor.success ? '✓' : '✗'} <b>Monitor</b>: ${results.monitor.success ? 'Success' : 'Failed'}\n`;
      if (results.monitor.workflow) {
        text += `  - Workflow: ${results.monitor.workflow.conclusion}\n`;
      }
    }
  }

  // Retry info
  if (results.retryCount > 0) {
    text += `\n🔄 <b>Self-healing attempts</b>: ${results.retryCount}\n`;
  }

  // Overall status
  text += `\n<b>Overall</b>: ${results.success ? '✓ Success' : '✗ Failed'}`;

  // Add completion token if present
  if (results.completionToken) {
    text += `\n\n${results.completionToken}`;
  }

  return text;
}

export default {
  executeAgentLoop,
  formatLoopResults
};
