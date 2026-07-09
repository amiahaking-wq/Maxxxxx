import { octokit, REPO_OWNER, REPO_NAME } from './octokit.js';
import logger from '../utils/logger.js';

/**
 * List workflow runs for a repository
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of workflow runs
 */
export async function listWorkflowRuns(options = {}) {
  try {
    const params = {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      per_page: options.perPage || 10,
      ...options
    };

    const { data } = await octokit.actions.listWorkflowRunsForRepo(params);

    logger.info('Fetched workflow runs', {
      count: data.workflow_runs.length,
      total: data.total_count
    });

    return data.workflow_runs;
  } catch (error) {
    logger.error('Failed to list workflow runs', { error: error.message });
    throw error;
  }
}

/**
 * Get specific workflow run
 * @param {number} runId - Workflow run ID
 * @returns {Promise<Object>} Workflow run data
 */
export async function getWorkflowRun(runId) {
  try {
    const { data } = await octokit.actions.getWorkflowRun({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      run_id: runId
    });

    logger.info('Fetched workflow run', {
      runId,
      status: data.status,
      conclusion: data.conclusion
    });

    return data;
  } catch (error) {
    logger.error('Failed to get workflow run', { runId, error: error.message });
    throw error;
  }
}

/**
 * Get jobs for a workflow run
 * @param {number} runId - Workflow run ID
 * @returns {Promise<Array>} Array of jobs
 */
export async function getWorkflowJobs(runId) {
  try {
    const { data } = await octokit.actions.listJobsForWorkflowRun({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      run_id: runId
    });

    return data.jobs;
  } catch (error) {
    logger.error('Failed to get workflow jobs', { runId, error: error.message });
    throw error;
  }
}

/**
 * Get logs for a workflow run
 * @param {number} runId - Workflow run ID
 * @returns {Promise<string>} Workflow logs (URL)
 */
export async function getWorkflowLogs(runId) {
  try {
    const { url } = await octokit.actions.downloadWorkflowRunLogs({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      run_id: runId
    });

    return url;
  } catch (error) {
    logger.error('Failed to get workflow logs', { runId, error: error.message });
    throw error;
  }
}

/**
 * Monitor latest workflow run
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {number} pollIntervalMs - Poll interval in milliseconds
 * @returns {Promise<Object>} Final workflow run state
 */
export async function monitorLatestWorkflow(timeoutMs = 600000, pollIntervalMs = 30000) {
  const startTime = Date.now();

  logger.info('Starting workflow monitoring', { timeoutMs, pollIntervalMs });

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Get latest workflow run
      const runs = await listWorkflowRuns({ per_page: 1 });

      if (runs.length === 0) {
        logger.warn('No workflow runs found');
        await sleep(pollIntervalMs);
        continue;
      }

      const latestRun = runs[0];

      logger.info('Monitoring workflow', {
        runId: latestRun.id,
        status: latestRun.status,
        conclusion: latestRun.conclusion
      });

      // Check if workflow is complete
      if (latestRun.status === 'completed') {
        logger.info('Workflow completed', {
          runId: latestRun.id,
          conclusion: latestRun.conclusion
        });

        return {
          runId: latestRun.id,
          status: latestRun.status,
          conclusion: latestRun.conclusion,
          htmlUrl: latestRun.html_url,
          success: latestRun.conclusion === 'success'
        };
      }

      // Wait before next poll
      await sleep(pollIntervalMs);
    } catch (error) {
      logger.error('Error during workflow monitoring', { error: error.message });
      await sleep(pollIntervalMs);
    }
  }

  throw new Error('Workflow monitoring timed out');
}

/**
 * Get workflow run summary
 * @param {number} runId - Workflow run ID
 * @returns {Promise<Object>} Workflow summary
 */
export async function getWorkflowSummary(runId) {
  try {
    const run = await getWorkflowRun(runId);
    const jobs = await getWorkflowJobs(runId);

    const failedJobs = jobs.filter(job => job.conclusion === 'failure');
    const cancelledJobs = jobs.filter(job => job.conclusion === 'cancelled');

    const summary = {
      runId: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.html_url,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      totalJobs: jobs.length,
      failedJobs: failedJobs.length,
      cancelledJobs: cancelledJobs.length,
      duration: run.updated_at ?
        (new Date(run.updated_at) - new Date(run.created_at)) / 1000 : null,
      failedJobDetails: failedJobs.map(job => ({
        name: job.name,
        conclusion: job.conclusion,
        htmlUrl: job.html_url
      }))
    };

    return summary;
  } catch (error) {
    logger.error('Failed to get workflow summary', { runId, error: error.message });
    throw error;
  }
}

/**
 * Format workflow summary as text
 * @param {Object} summary - Workflow summary
 * @returns {string} Formatted text
 */
export function formatWorkflowSummary(summary) {
  let text = `**Workflow: ${summary.name}**\n\n`;
  text += `Status: ${summary.status}\n`;
  text += `Conclusion: ${summary.conclusion || 'N/A'}\n`;
  text += `Duration: ${summary.duration ? Math.round(summary.duration) + 's' : 'N/A'}\n`;
  text += `Jobs: ${summary.totalJobs} total`;

  if (summary.failedJobs > 0) {
    text += `, ${summary.failedJobs} failed`;
  }
  if (summary.cancelledJobs > 0) {
    text += `, ${summary.cancelledJobs} cancelled`;
  }

  text += `\n\nView run: ${summary.htmlUrl}\n`;

  if (summary.failedJobDetails.length > 0) {
    text += `\n**Failed Jobs:**\n`;
    for (const job of summary.failedJobDetails) {
      text += `- ${job.name}: ${job.htmlUrl}\n`;
    }
  }

  return text;
}

/**
 * Helper function to sleep
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  listWorkflowRuns,
  getWorkflowRun,
  getWorkflowJobs,
  getWorkflowLogs,
  monitorLatestWorkflow,
  getWorkflowSummary,
  formatWorkflowSummary
};
