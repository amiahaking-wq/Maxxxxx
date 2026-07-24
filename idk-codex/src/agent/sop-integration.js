/**
 * SOP Integration Module
 *
 * Integrates the SOP (Standard Operating Procedure) system with the existing
 * agent loop. Provides a feature-flagged alternative execution path.
 *
 * When ENABLE_SOP=true:
 * - Uses SOPExecutor and specialists
 * - Creates and tracks SOP worksheets
 * - Delegates to specialist agents
 *
 * When ENABLE_SOP=false:
 * - Falls back to existing 5-phase loop
 * - No disruption to current functionality
 *
 * Based on Claude Code's SOP integration
 */

import { SOPExecutor } from './sop/executor.js';
import { createSpecialistRegistry } from './specialists/index.js';
import logger from '../utils/logger.js';
import { logAuditEvent } from '../database/queries.js';
import TokenBudgetManager from '../groq/token-budget.js';

const ENABLE_SOP = process.env.ENABLE_SOP === 'true';

/**
 * Execute agent loop with optional SOP support
 *
 * @param {string} task - Task description
 * @param {number} sessionId - Session ID
 * @param {Function} progressCallback - Progress callback function
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Execution result
 */
export async function executeWithSOP(task, sessionId, progressCallback, userId) {
  if (!ENABLE_SOP) {
    // Return null to indicate SOP not used - caller should use normal loop
    return null;
  }

  try {
    logger.info('Executing with SOP system', { task, sessionId, userId });

    // Initialize token budget manager
    const budgetManager = new TokenBudgetManager();

    // Create specialist registry
    const specialists = await createSpecialistRegistry();

    // Create SOP executor
    const sopExecutor = new SOPExecutor(sessionId, userId);
    sopExecutor.setSpecialists(specialists);

    // Report progress
    if (progressCallback) {
      await progressCallback('sop-init', 'running', {
        message: 'Initializing SOP workflow'
      });
    }

    // Parse task details
    const taskDetails = parseTaskDetails(task);

    // Create execution context
    const context = {
      sessionId,
      userId,
      budgetManager,
      workingDir: process.cwd(),
      filesModified: [],
      progressCallback
    };

    // Execute SOP workflow
    const result = await sopExecutor.execute(taskDetails, context);

    // Report final progress
    if (progressCallback) {
      await progressCallback(
        'sop-complete',
        result.success ? 'success' : 'failed',
        {
          message: result.success
            ? 'SOP workflow completed'
            : `SOP workflow failed: ${result.error}`,
          worksheetPath: result.worksheetPath
        }
      );
    }

    // Log audit event
    await logAuditEvent(
      userId,
      sessionId,
      'sop_execution_complete',
      'SOP workflow execution completed',
      {
        success: result.success,
        worksheetPath: result.worksheetPath
      },
      result.success ? 'low' : 'medium'
    );

    return {
      success: result.success,
      error: result.error,
      results: result.results,
      worksheetPath: result.worksheetPath,
      usedSOP: true,
      budgetUsage: {
        input: budgetManager.currentInput,
        output: budgetManager.currentOutput,
        total: budgetManager.currentInput + budgetManager.currentOutput
      }
    };
  } catch (error) {
    logger.error('SOP execution failed', {
      error: error.message,
      sessionId,
      task
    });

    await logAuditEvent(
      userId,
      sessionId,
      'sop_execution_error',
      'SOP workflow execution error',
      { error: error.message },
      'high'
    );

    return {
      success: false,
      error: error.message,
      usedSOP: true
    };
  }
}

/**
 * Parse task string into structured task details
 *
 * @param {string} task - Task string
 * @returns {Object} Parsed task details
 */
function parseTaskDetails(task) {
  const details = {
    description: task,
    repository: null,
    issueNumber: null
  };

  // Extract repository if mentioned (e.g., "in owner/repo" or "owner/repo:")
  const repoMatch = task.match(/(?:in|for)\s+([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/i);
  if (repoMatch) {
    details.repository = repoMatch[1];
  }

  // Extract issue number if mentioned (e.g., "#123" or "issue 123")
  const issueMatch = task.match(/#(\d+)|issue\s+(\d+)/i);
  if (issueMatch) {
    details.issueNumber = parseInt(issueMatch[1] || issueMatch[2]);
  }

  return details;
}

/**
 * Check if SOP is enabled
 *
 * @returns {boolean} True if SOP is enabled
 */
export function isSOPEnabled() {
  return ENABLE_SOP;
}

/**
 * Get SOP configuration
 *
 * @returns {Object} SOP configuration
 */
export function getSOPConfig() {
  return {
    enabled: ENABLE_SOP,
    workflow: process.env.SOP_WORKFLOW || 'standard-development-task',
    maxRetries: parseInt(process.env.SOP_MAX_RETRIES || '10', 10),
    worksheetDir: process.env.SOP_WORKSHEET_DIR || '/tmp/volter/sop'
  };
}
