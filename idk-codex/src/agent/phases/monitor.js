import {
  monitorLatestWorkflow,
  getWorkflowSummary,
  formatWorkflowSummary
} from '../../github/workflows.js';
import logger from '../../utils/logger.js';

/**
 * Execute MONITOR phase
 * @param {Object} deployResult - Result from deploy phase
 * @param {Object} options - Monitor options
 * @returns {Promise<Object>} Monitor result
 */
export async function executeMonitorPhase(deployResult, options = {}) {
  try {
    logger.logPhase('monitor', 'started');

    // Skip if deploy was skipped or failed
    if (!deployResult.success || deployResult.skipped) {
      logger.info('Skipping monitor: deploy was not successful');
      return {
        success: true,
        skipped: true,
        reason: 'Deploy was not successful'
      };
    }

    // Skip if push was not successful
    if (!deployResult.push || !deployResult.push.success) {
      logger.info('Skipping monitor: push was not successful');
      return {
        success: true,
        skipped: true,
        reason: 'Push was not successful'
      };
    }

    // Monitor workflow execution
    const timeoutMs = options.timeoutMs || 600000; // 10 minutes default
    const pollIntervalMs = options.pollIntervalMs || 30000; // 30 seconds default

    logger.info('Monitoring GitHub Actions workflow', {
      timeout: timeoutMs,
      pollInterval: pollIntervalMs
    });

    try {
      const workflowResult = await monitorLatestWorkflow(timeoutMs, pollIntervalMs);

      // Get detailed summary
      const summary = await getWorkflowSummary(workflowResult.runId);

      logger.logPhase('monitor', workflowResult.success ? 'success' : 'failed', {
        runId: workflowResult.runId,
        conclusion: workflowResult.conclusion
      });

      return {
        success: true,
        workflow: workflowResult,
        summary,
        formattedSummary: formatWorkflowSummary(summary)
      };
    } catch (error) {
      if (error.message.includes('timeout')) {
        logger.warn('Workflow monitoring timed out');
        return {
          success: false,
          timedOut: true,
          error: 'Workflow monitoring timed out'
        };
      }

      throw error;
    }
  } catch (error) {
    logger.error('Monitor phase failed', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get workflow status (without blocking)
 * @returns {Promise<Object|null>} Workflow status or null
 */
export async function getWorkflowStatus() {
  try {
    const { listWorkflowRuns } = await import('../../github/workflows.js');
    const runs = await listWorkflowRuns({ per_page: 1 });

    if (runs.length === 0) {
      return null;
    }

    const latestRun = runs[0];

    return {
      runId: latestRun.id,
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      htmlUrl: latestRun.html_url,
      createdAt: latestRun.created_at,
      updatedAt: latestRun.updated_at
    };
  } catch (error) {
    logger.error('Failed to get workflow status', { error: error.message });
    return null;
  }
}

export default {
  executeMonitorPhase,
  getWorkflowStatus
};
