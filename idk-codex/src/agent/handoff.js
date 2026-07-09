/**
 * V2 Enhancement: Session Handoff Manager
 * Purpose: Create and load handoff snapshots for session continuity
 * Integration Point: Used in agent loop when token budget or retry limits reached
 */

import { createHandoffSnapshot as dbCreateHandoff, getLatestHandoff, markHandoffResumed } from '../database/queries.js';
import logger from '../utils/logger.js';

/**
 * Check if handoff should be triggered
 * @param {Object} budgetManager - Token budget manager
 * @param {number} retryCount - Current retry count
 * @returns {boolean} True if handoff should be triggered
 */
export function shouldTriggerHandoff(budgetManager, retryCount) {
  const retryThreshold = parseInt(process.env.HANDOFF_RETRY_THRESHOLD || '5', 10);

  // Trigger if token budget threshold reached
  if (budgetManager && budgetManager.shouldTriggerHandoff()) {
    logger.info('Handoff triggered by token budget threshold');
    return true;
  }

  // Trigger if retry threshold reached
  if (retryCount >= retryThreshold) {
    logger.info('Handoff triggered by retry threshold', { retryCount, retryThreshold });
    return true;
  }

  return false;
}

/**
 * Create a handoff snapshot for session continuity
 * @param {number} sessionId - Session ID
 * @param {Object} context - Current execution context
 * @param {Object} budgetUsage - Token budget usage
 * @param {number} retryCount - Current retry count
 * @param {string|null} lastError - Last error message
 * @returns {Promise<Object>} Handoff snapshot {id, snapshot}
 */
export async function createHandoffSnapshot(sessionId, context, budgetUsage, retryCount, lastError = null) {
  try {
    logger.info('Creating handoff snapshot', { sessionId, retryCount });

    // Format snapshot as markdown
    const snapshot = formatHandoffSnapshot(context, budgetUsage, retryCount, lastError);

    // Save to database
    const handoffId = dbCreateHandoff(
      sessionId,
      snapshot,
      {
        input: budgetUsage?.currentInput || 0,
        output: budgetUsage?.currentOutput || 0
      },
      retryCount,
      lastError
    );

    logger.info('Handoff snapshot created', { sessionId, handoffId });

    return {
      id: handoffId,
      snapshot
    };
  } catch (error) {
    logger.error('Failed to create handoff snapshot', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Format handoff snapshot as markdown
 * @param {Object} context - Execution context
 * @param {Object} budgetUsage - Token budget usage
 * @param {number} retryCount - Retry count
 * @param {string|null} lastError - Last error
 * @returns {string} Formatted markdown snapshot
 */
function formatHandoffSnapshot(context, budgetUsage, retryCount, lastError) {
  const sections = [];

  // Header
  sections.push('# Session Handoff Snapshot');
  sections.push(`\nGenerated: ${new Date().toISOString()}\n`);

  // Mission
  sections.push('## Mission');
  sections.push(context.task || 'No task specified');

  // Current Phase
  sections.push('\n## Current Phase');
  sections.push(context.currentPhase || 'unknown');

  // Files Modified
  if (context.filesModified && context.filesModified.length > 0) {
    sections.push('\n## Files Modified');
    context.filesModified.forEach(file => {
      sections.push(`- ${file}`);
    });
  }

  // Plan
  if (context.plan) {
    sections.push('\n## Plan');
    if (context.plan.steps) {
      sections.push('### Steps:');
      context.plan.steps.forEach((step, idx) => {
        sections.push(`${idx + 1}. **${step.action}** ${step.file}: ${step.description}`);
      });
    }
    if (context.plan.estimated_complexity) {
      sections.push(`\n**Complexity**: ${context.plan.estimated_complexity}`);
    }
  }

  // Errors
  if (lastError) {
    sections.push('\n## Last Error');
    sections.push('```');
    sections.push(lastError.substring(0, 1000)); // Limit error length
    sections.push('```');
  }

  // Retry Information
  sections.push('\n## Retry Information');
  sections.push(`Attempts: ${retryCount}`);

  // Token Usage
  if (budgetUsage) {
    sections.push('\n## Token Usage');
    sections.push(`Input: ${budgetUsage.currentInput || 0}`);
    sections.push(`Output: ${budgetUsage.currentOutput || 0}`);
    sections.push(`Total: ${(budgetUsage.currentInput || 0) + (budgetUsage.currentOutput || 0)}`);
  }

  // Next Steps
  sections.push('\n## Next Steps');
  if (retryCount > 0 && lastError) {
    sections.push('1. Review and fix the last error');
    sections.push('2. Resume execution from the failed phase');
  } else {
    sections.push('1. Resume execution from current phase');
  }
  sections.push('2. Continue with remaining plan steps');
  sections.push('3. Monitor token budget');

  return sections.join('\n');
}

/**
 * Load the latest handoff snapshot for a session
 * @param {number} sessionId - Session ID
 * @returns {Promise<Object|null>} Parsed handoff data or null
 */
export async function loadLatestHandoff(sessionId) {
  try {
    const handoff = getLatestHandoff(sessionId);

    if (!handoff) {
      logger.debug('No pending handoff found', { sessionId });
      return null;
    }

    logger.info('Loading handoff snapshot', { sessionId, handoffId: handoff.id });

    // Parse the markdown snapshot
    const parsed = parseHandoffSnapshot(handoff.snapshot_data);

    return {
      id: handoff.id,
      sessionId: handoff.session_id,
      retryCount: handoff.retry_count,
      lastError: handoff.last_error,
      tokenUsage: {
        input: handoff.token_usage_input,
        output: handoff.token_usage_output
      },
      createdAt: handoff.created_at,
      ...parsed
    };
  } catch (error) {
    logger.error('Failed to load handoff snapshot', { sessionId, error: error.message });
    return null;
  }
}

/**
 * Parse handoff snapshot markdown
 * @param {string} snapshot - Markdown snapshot
 * @returns {Object} Parsed data
 */
function parseHandoffSnapshot(snapshot) {
  const result = {
    task: null,
    currentPhase: null,
    filesModified: [],
    plan: null
  };

  try {
    // Extract mission
    const missionMatch = snapshot.match(/## Mission\n(.*?)(?=\n##|$)/s);
    if (missionMatch) {
      result.task = missionMatch[1].trim();
    }

    // Extract current phase
    const phaseMatch = snapshot.match(/## Current Phase\n(.*?)(?=\n##|$)/s);
    if (phaseMatch) {
      result.currentPhase = phaseMatch[1].trim();
    }

    // Extract files modified
    const filesMatch = snapshot.match(/## Files Modified\n(.*?)(?=\n##|$)/s);
    if (filesMatch) {
      const fileLines = filesMatch[1].split('\n').filter(line => line.trim().startsWith('-'));
      result.filesModified = fileLines.map(line => line.replace(/^-\s*/, '').trim());
    }

    logger.debug('Parsed handoff snapshot', result);
  } catch (error) {
    logger.warn('Failed to parse some handoff data', { error: error.message });
  }

  return result;
}

/**
 * Mark a handoff as resumed
 * @param {number} handoffId - Handoff ID
 */
export function resumeHandoff(handoffId) {
  try {
    markHandoffResumed(handoffId);
    logger.info('Handoff resumed', { handoffId });
  } catch (error) {
    logger.error('Failed to mark handoff as resumed', { handoffId, error: error.message });
    throw error;
  }
}

export default {
  shouldTriggerHandoff,
  createHandoffSnapshot,
  loadLatestHandoff,
  resumeHandoff
};
