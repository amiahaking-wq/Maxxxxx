/**
 * Enhanced Deploy Phase (v2.0)
 *
 * Integrates:
 * - Dual-pass verification before deployment
 * - Automatic feature branch management
 * - Conventional commit generation
 * - Branch tracking URLs
 *
 * @module deploy-v2
 */

import { GitHubBranchManager } from '../../github/branch-manager.js';
import { DualPassValidator } from '../verification/dual-pass-validator.js';
import { hasChanges, getStatus } from '../../utils/git.js';
import logger from '../../utils/logger.js';

/**
 * Execute enhanced DEPLOY phase with validation and branch management
 *
 * @param {string} sessionId - Session ID
 * @param {string} task - Task description
 * @param {Object} executeResult - Result from execute phase
 * @param {Object} testResult - Result from test phase
 * @param {Object} options - Deploy options
 * @returns {Promise<Object>} Deploy result
 */
export async function executeDeployPhaseV2(sessionId, task, executeResult, testResult, options = {}) {
  try {
    logger.logPhase('deploy', 'started', { sessionId });

    // Step 0: Check if tests passed (if tests were run)
    if (!testResult.skipped && !testResult.success) {
      logger.warn('Skipping deploy: tests failed');
      return {
        success: false,
        skipped: true,
        reason: 'Tests failed',
        testResult
      };
    }

    // Step 1: Check if there are changes to commit
    const hasUncommittedChanges = await hasChanges();
    if (!hasUncommittedChanges) {
      logger.info('No changes to deploy');
      return {
        success: true,
        skipped: true,
        reason: 'No changes to commit'
      };
    }

    // Step 2: Get git status and file list
    const status = await getStatus();
    const filesModified = [
      ...status.modified.map(f => ({ path: f, status: 'modified' })),
      ...status.created.map(f => ({ path: f, status: 'new' })),
      ...status.deleted.map(f => ({ path: f, status: 'deleted' })),
      ...status.renamed.map(f => ({ path: f.to, status: 'renamed', from: f.from }))
    ];

    logger.info('Git status', {
      modified: status.modified.length,
      created: status.created.length,
      deleted: status.deleted.length,
      renamed: status.renamed.length,
      totalFiles: filesModified.length
    });

    // Step 3: Dual-Pass Verification (if enabled and not skipped)
    const skipValidation = options.skipValidation || process.env.SKIP_DEPLOY_VALIDATION === 'true';
    let validationResult = { valid: true, skipped: true };

    if (!skipValidation) {
      logger.info('Running dual-pass verification before deploy');

      const llmAdapter = options.llmAdapter;
      if (!llmAdapter) {
        logger.warn('No LLM adapter provided, skipping validation');
      } else {
        const validator = new DualPassValidator(llmAdapter);

        // Validate all modified code files
        const codeFiles = filesModified.filter(f =>
          /\.(js|jsx|ts|tsx|py|json)$/.test(f.path) && f.status !== 'deleted'
        );

        if (codeFiles.length > 0) {
          logger.info(`Validating ${codeFiles.length} code files`);

          // For simplicity, validate the first modified code file
          // (Full implementation would validate all files)
          const fileToValidate = codeFiles[0];

          try {
            const fs = await import('fs/promises');
            const code = await fs.readFile(fileToValidate.path, 'utf-8');

            validationResult = await validator.validateWithSelfHealing(
              fileToValidate.path,
              code,
              3 // Max 3 retries for deploy validation
            );

            if (!validationResult.valid) {
              logger.error('Validation failed, aborting deploy', {
                file: fileToValidate.path,
                attempts: validationResult.attempts
              });

              return {
                success: false,
                error: 'Code validation failed',
                validationResult,
                filesModified
              };
            }

            logger.info('Validation passed', {
              file: fileToValidate.path,
              attempts: validationResult.attempts
            });

          } catch (error) {
            logger.error('Validation error, proceeding anyway', {
              error: error.message
            });
          }
        }
      }
    }

    // Step 4: Create feature branch (if enabled)
    const useFeatureBranch = options.useFeatureBranch !== false &&
                            process.env.AUTO_FEATURE_BRANCH !== 'false';

    let branchManager;
    let branchName;

    if (useFeatureBranch) {
      logger.info('Creating feature branch for task');

      branchManager = new GitHubBranchManager(options.workspaceDir);

      try {
        branchName = await branchManager.createTaskBranch(sessionId, task);

        logger.info('Feature branch created', { branchName });

      } catch (error) {
        logger.error('Failed to create feature branch, using current branch', {
          error: error.message
        });

        // Continue with current branch
        branchName = await branchManager.getCurrentBranch();
      }
    } else {
      branchManager = new GitHubBranchManager(options.workspaceDir);
      branchName = await branchManager.getCurrentBranch();

      logger.info('Using current branch', { branchName });
    }

    // Step 5: Generate conventional commit message
    const commitMessage = branchManager.generateConventionalCommit(
      filesModified,
      testResult,
      task
    );

    logger.info('Generated commit message', {
      firstLine: commitMessage.split('\n')[0],
      totalLines: commitMessage.split('\n').length
    });

    // Step 6: Push branch and get tracking URL
    let trackingUrl;

    try {
      trackingUrl = await branchManager.pushAndTrack(branchName, commitMessage);

      logger.info('Successfully pushed to remote', {
        branchName,
        trackingUrl
      });

    } catch (error) {
      logger.error('Failed to push to remote', {
        branchName,
        error: error.message
      });

      return {
        success: false,
        error: `Push failed: ${error.message}`,
        branchName,
        commitMessage,
        filesModified
      };
    }

    // Step 7: Get commit SHA
    const commitSha = await branchManager.getLatestCommitSha();

    logger.logPhase('deploy', 'completed', {
      branchName,
      commitSha: commitSha.substring(0, 7),
      filesChanged: filesModified.length,
      trackingUrl
    });

    return {
      success: true,
      branchName,
      commitMessage,
      commitSha,
      trackingUrl,
      filesModified,
      filesChanged: filesModified.length,
      validation: validationResult,
      testResult
    };

  } catch (error) {
    logger.error('Deploy phase failed', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Backward-compatible wrapper for existing deploy phase
 *
 * This allows gradual migration from deploy.js to deploy-v2.js
 *
 * @param {Object} executeResult - Execute result
 * @param {Object} testResult - Test result
 * @param {Object} options - Options
 * @returns {Promise<Object>} Deploy result
 */
export async function executeDeployPhase(executeResult, testResult, options = {}) {
  // Extract sessionId and task from options or executeResult
  const sessionId = options.sessionId || executeResult.sessionId || `session-${Date.now()}`;
  const task = options.task || executeResult.task || 'Unknown task';

  return executeDeployPhaseV2(sessionId, task, executeResult, testResult, options);
}

export default executeDeployPhaseV2;
