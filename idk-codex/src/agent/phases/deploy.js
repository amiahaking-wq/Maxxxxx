import {
  getStatus,
  addFiles,
  createCommit,
  pushToRemote,
  hasChanges,
  getCurrentBranch
} from '../../utils/git.js';
import logger from '../../utils/logger.js';
import { QuadPassValidator } from '../verification/quad-pass-validator.js';
import { readFileSafe } from '../../utils/filesystem.js';

/**
 * Execute DEPLOY phase
 * @param {Object} executeResult - Result from execute phase
 * @param {Object} testResult - Result from test phase
 * @param {Object} options - Deploy options
 * @returns {Promise<Object>} Deploy result
 */
export async function executeDeployPhase(executeResult, testResult, options = {}) {
  try {
    logger.logPhase('deploy', 'started');

    // Check if tests passed (if tests were run)
    if (!testResult.skipped && !testResult.success) {
      logger.warn('Skipping deploy: tests failed');
      return {
        success: false,
        skipped: true,
        reason: 'Tests failed'
      };
    }

    // Check if there are changes to commit
    const hasUncommittedChanges = await hasChanges();
    if (!hasUncommittedChanges) {
      logger.info('No changes to deploy');
      return {
        success: true,
        skipped: true,
        reason: 'No changes to commit'
      };
    }

    // Get git status
    const status = await getStatus();
    logger.info('Git status', {
      modified: status.modified.length,
      created: status.created.length,
      deleted: status.deleted.length
    });

    // Quad-pass validation (if enabled)
    const enableQuadPass = process.env.QUAD_PASS_VALIDATION !== 'false';

    if (enableQuadPass && executeResult.filesModified && executeResult.filesModified.length > 0) {
      logger.info('Running quad-pass validation before deployment');

      try {
        // Import LLM adapter for validation
        const { default: GroqAdapter } = await import('../../groq/groq-adapter.js');
        const llmAdapter = new GroqAdapter();

        const validator = new QuadPassValidator(llmAdapter, options.budgetManager);

        // Prepare files for validation
        const filesToValidate = [];
        for (const filePath of executeResult.filesModified) {
          try {
            const code = await readFileSafe(filePath);
            filesToValidate.push({ path: filePath, code });
          } catch (error) {
            logger.warn('Could not read file for validation', { filePath, error: error.message });
          }
        }

        // Run validation
        const validationResult = await validator.validateFiles(filesToValidate, false);

        if (!validationResult.valid) {
          logger.error('Quad-pass validation failed', {
            filesChecked: validationResult.summary.filesChecked,
            filesFailed: validationResult.summary.filesFailed
          });

          // Generate detailed report
          const report = validator.generateReport(validationResult);
          logger.info('Validation report', { report });

          return {
            success: false,
            error: 'Quad-pass validation failed',
            validationReport: report,
            validationResults: validationResult
          };
        }

        logger.info('Quad-pass validation passed', {
          filesChecked: validationResult.summary.filesChecked
        });

      } catch (error) {
        logger.error('Quad-pass validation error', { error: error.message });

        // Check if fail-closed is enabled
        const failClosed = process.env.QUAD_PASS_FAIL_CLOSED !== 'false';

        if (failClosed) {
          return {
            success: false,
            error: `Validation failed: ${error.message}`
          };
        } else {
          logger.warn('Validation failed but continuing (fail-open mode)');
        }
      }
    }

    // Add files to staging
    logger.info('Adding files to staging');
    await addFiles('.');

    // Generate commit message
    const commitMessage = options.commitMessage ||
      generateCommitMessage(executeResult, testResult);

    // Create commit
    logger.info('Creating commit', { message: commitMessage });
    const commitResult = await createCommit(commitMessage);

    // Push to remote (if configured)
    const shouldPush = options.push !== false; // Default to true
    let pushResult = null;

    if (shouldPush) {
      try {
        const currentBranch = await getCurrentBranch();

        // GITHUB CONNECTOR INTEGRATION
        // If AUTO_COMMIT_FIXES is enabled, use GitHub connector for enhanced metadata
        if (process.env.AUTO_COMMIT_FIXES === 'true' && executeResult.filesModified?.length > 0) {
          try {
            logger.info('Pushing to remote via GitHub connector', { branch: currentBranch });

            const connector = await import('../github-connector.js');
            const githubPushResult = await connector.commitAndPushChanges(
              options.sessionId || 'unknown',
              executeResult.filesModified,
              commitMessage,
              { skipPush: false, coAuthor: 'MAX Agent <max@autonomous-agent.dev>' }
            );

            if (githubPushResult.success) {
              pushResult = {
                success: true,
                branch: githubPushResult.branch,
                commit: githubPushResult.commit
              };
              logger.info('Successfully pushed via GitHub connector', githubPushResult);
            } else {
              throw new Error(githubPushResult.error);
            }
          } catch (connectorError) {
            // Fallback to simple-git
            logger.warn('GitHub connector failed, falling back to simple-git', {
              error: connectorError.message
            });

            logger.info('Pushing to remote via simple-git', { branch: currentBranch });
            await pushToRemote('origin', currentBranch);
            pushResult = { success: true, branch: currentBranch };
            logger.info('Successfully pushed to remote via simple-git');
          }
        } else {
          // Standard push without GitHub connector
          logger.info('Pushing to remote', { branch: currentBranch });
          await pushToRemote('origin', currentBranch);
          pushResult = { success: true, branch: currentBranch };
          logger.info('Successfully pushed to remote');
        }
      } catch (error) {
        logger.error('Failed to push to remote', { error: error.message });
        pushResult = {
          success: false,
          error: error.message
        };
      }
    }

    logger.logPhase('deploy', 'completed', {
      commitHash: commitResult.commit,
      pushed: pushResult?.success
    });

    return {
      success: true,
      commit: {
        hash: commitResult.commit,
        message: commitMessage
      },
      push: pushResult,
      filesChanged: status.modified.length + status.created.length + status.deleted.length
    };
  } catch (error) {
    logger.error('Deploy phase failed', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate commit message based on execution results
 * @param {Object} executeResult - Execution result
 * @param {Object} testResult - Test result
 * @returns {string} Commit message
 */
function generateCommitMessage(executeResult, testResult) {
  const filesModified = executeResult.filesModified || [];

  let message = '';

  // Determine commit type
  const hasNewFiles = executeResult.executedSteps?.some(s => s.action === 'create');
  const hasModifiedFiles = executeResult.executedSteps?.some(s => s.action === 'modify');

  if (hasNewFiles && hasModifiedFiles) {
    message = 'feat: implement new features and update existing code';
  } else if (hasNewFiles) {
    message = 'feat: add new implementation';
  } else if (hasModifiedFiles) {
    message = 'refactor: update existing implementation';
  } else {
    message = 'chore: update project files';
  }

  // Add details
  message += '\n\n';

  if (filesModified.length > 0) {
    message += 'Modified files:\n';
    filesModified.slice(0, 10).forEach(file => {
      message += `- ${file}\n`;
    });

    if (filesModified.length > 10) {
      message += `... and ${filesModified.length - 10} more files\n`;
    }
  }

  // Add test information
  if (!testResult.skipped) {
    message += '\n';
    if (testResult.success) {
      message += 'All tests passing ✓\n';
    } else {
      message += 'Tests: ' + (testResult.insights?.passedTests || 0) + ' passed\n';
    }
  }

  // Add co-author
  message += '\nCo-Authored-By: Autonomous Agent <agent@autonomous-cicd.dev>';

  return message;
}

/**
 * Rollback deployment (reset to previous commit)
 * @returns {Promise<Object>} Rollback result
 */
export async function rollbackDeployment() {
  try {
    logger.info('Rolling back deployment');

    const { resetRepository } = await import('../../utils/git.js');
    await resetRepository(true);

    logger.info('Rollback completed');

    return {
      success: true
    };
  } catch (error) {
    logger.error('Rollback failed', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  executeDeployPhase,
  rollbackDeployment,
  generateCommitMessage
};
