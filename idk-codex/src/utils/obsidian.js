/**
 * V2 Enhancement: Obsidian Vault Integration
 * Purpose: Write phase notes to Obsidian vault for knowledge management
 * Integration Point: Called after each phase in agent loop (fire-and-forget)
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import logger from './logger.js';

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || './obsidian-vault';
const DOCS_PATH = join(VAULT_PATH, 'docs');

/**
 * Initialize Obsidian vault folder structure
 * Creates necessary directories if they don't exist
 * @returns {Promise<void>}
 */
export async function initializeVault() {
  try {
    // Create vault directories
    await fs.mkdir(DOCS_PATH, { recursive: true });
    await fs.mkdir(join(VAULT_PATH, '.obsidian'), { recursive: true });

    logger.info('Obsidian vault initialized', { path: VAULT_PATH });
  } catch (error) {
    logger.warn('Failed to initialize Obsidian vault', { error: error.message });
    // Don't throw - vault is optional
  }
}

/**
 * Write a phase note to the Obsidian vault
 * @param {number} sessionId - Session ID
 * @param {string} phase - Phase name (plan, execute, test, deploy, monitor)
 * @param {string|Object} content - Phase content (string or object)
 * @param {Date} timestamp - Note timestamp
 * @returns {Promise<void>}
 */
export async function writePhaseNote(sessionId, phase, content, timestamp = new Date()) {
  try {
    // Ensure vault exists
    await initializeVault();

    // Validate sessionId
    if (!Number.isInteger(sessionId) || sessionId < 0) {
      throw new Error(`Invalid session ID for Obsidian note: ${sessionId}`);
    }

    // Format filename: YYYY-MM-DD-session-{id}-{phase}.md
    const dateStr = timestamp.toISOString().split('T')[0];
    const filename = `${dateStr}-session-${sessionId}-${phase}.md`;
    const filepath = join(DOCS_PATH, filename);

    // Format content as markdown
    const markdown = formatPhaseNote(sessionId, phase, content, timestamp);

    // Write file
    await fs.writeFile(filepath, markdown, 'utf-8');

    logger.info('Phase note written to Obsidian vault', {
      sessionId,
      phase,
      filename
    });
  } catch (error) {
    // Never throw - this is fire-and-forget
    logger.warn('Failed to write Obsidian phase note', {
      sessionId,
      phase,
      error: error.message
    });
  }
}

/**
 * Format phase content as markdown with frontmatter
 * @param {number} sessionId - Session ID
 * @param {string} phase - Phase name
 * @param {string|Object} content - Phase content
 * @param {Date} timestamp - Timestamp
 * @returns {string} Formatted markdown
 */
function formatPhaseNote(sessionId, phase, content, timestamp) {
  const sections = [];

  // Frontmatter
  sections.push('---');
  sections.push(`sessionId: ${sessionId}`);
  sections.push(`phase: ${phase}`);
  sections.push(`timestamp: ${timestamp.toISOString()}`);
  sections.push(`date: ${timestamp.toISOString().split('T')[0]}`);
  sections.push(`tags: [agent, ${phase}, session-${sessionId}]`);
  sections.push('---');
  sections.push('');

  // Title
  sections.push(`# ${capitalize(phase)} Phase - Session ${sessionId}`);
  sections.push('');
  sections.push(`**Date**: ${timestamp.toLocaleString()}`);
  sections.push('');

  // Content
  sections.push('## Results');
  sections.push('');

  if (typeof content === 'string') {
    sections.push(content);
  } else if (content && typeof content === 'object') {
    sections.push(formatObjectContent(content, phase));
  } else {
    sections.push('_No content available_');
  }

  // Links section
  sections.push('');
  sections.push('---');
  sections.push('');
  sections.push('## Related Notes');
  sections.push('');
  sections.push(`- [[session-${sessionId}]]`);
  sections.push(`- [[${phase}-phase]]`);

  return sections.join('\n');
}

/**
 * Format object content based on phase
 * @param {Object} content - Content object
 * @param {string} phase - Phase name
 * @returns {string} Formatted markdown
 */
function formatObjectContent(content, phase) {
  const sections = [];

  switch (phase) {
    case 'plan':
      if (content.plan) {
        sections.push('### Plan Details');
        sections.push('');
        if (content.plan.steps) {
          sections.push('**Steps**:');
          content.plan.steps.forEach((step, idx) => {
            sections.push(`${idx + 1}. **${step.action}** \`${step.file}\`: ${step.description}`);
          });
        }
        if (content.plan.estimated_complexity) {
          sections.push('');
          sections.push(`**Complexity**: ${content.plan.estimated_complexity}`);
        }
        if (content.plan.risks && content.plan.risks.length > 0) {
          sections.push('');
          sections.push('**Risks**:');
          content.plan.risks.forEach(risk => {
            sections.push(`- ${risk}`);
          });
        }
      }
      break;

    case 'execute':
      if (content.filesModified && content.filesModified.length > 0) {
        sections.push('### Files Modified');
        sections.push('');
        content.filesModified.forEach(file => {
          sections.push(`- \`${file}\``);
        });
      }
      if (content.code) {
        sections.push('');
        sections.push('### Code');
        sections.push('');
        sections.push('```javascript');
        sections.push(content.code.substring(0, 1000)); // Limit size
        sections.push('```');
      }
      break;

    case 'test':
      if (content.insights) {
        sections.push('### Test Results');
        sections.push('');
        sections.push(`- **Total Tests**: ${content.insights.totalTests || 0}`);
        sections.push(`- **Passed**: ${content.insights.passedTests || 0}`);
        sections.push(`- **Failed**: ${content.insights.failedTests || 0}`);
      }
      if (content.stdout) {
        sections.push('');
        sections.push('### Output');
        sections.push('');
        sections.push('```');
        sections.push(content.stdout.substring(0, 500));
        sections.push('```');
      }
      break;

    case 'deploy':
      if (content.commit) {
        sections.push('### Commit Information');
        sections.push('');
        sections.push(`- **Hash**: \`${content.commit.hash}\``);
        sections.push(`- **Message**: ${content.commit.message}`);
      }
      if (content.pushed) {
        sections.push('- **Pushed to remote**: Yes');
      }
      break;

    case 'monitor':
      if (content.workflow) {
        sections.push('### Workflow Status');
        sections.push('');
        sections.push(`- **ID**: ${content.workflow.id}`);
        sections.push(`- **Conclusion**: ${content.workflow.conclusion}`);
        sections.push(`- **URL**: ${content.workflow.html_url || 'N/A'}`);
      }
      break;

    default:
      sections.push(JSON.stringify(content, null, 2));
  }

  // Add success/failure status
  sections.push('');
  sections.push('### Status');
  sections.push('');
  const status = content.success ? '✅ Success' : '❌ Failed';
  sections.push(status);

  if (content.error) {
    sections.push('');
    sections.push('### Error');
    sections.push('');
    sections.push('```');
    sections.push(content.error.substring(0, 500));
    sections.push('```');
  }

  return sections.join('\n');
}

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Create a session summary note
 * @param {number} sessionId - Session ID
 * @param {Object} results - Complete session results
 * @returns {Promise<void>}
 */
export async function writeSessionSummary(sessionId, results) {
  try {
    await initializeVault();

    // Validate sessionId
    if (!Number.isInteger(sessionId) || sessionId < 0) {
      throw new Error(`Invalid session ID for Obsidian note: ${sessionId}`);
    }

    const timestamp = new Date();
    const dateStr = timestamp.toISOString().split('T')[0];
    const filename = `${dateStr}-session-${sessionId}-summary.md`;
    const filepath = join(DOCS_PATH, filename);

    const sections = [];

    // Frontmatter
    sections.push('---');
    sections.push(`sessionId: ${sessionId}`);
    sections.push(`type: summary`);
    sections.push(`timestamp: ${timestamp.toISOString()}`);
    sections.push(`success: ${results.success || false}`);
    sections.push(`retries: ${results.retryCount || 0}`);
    sections.push(`tags: [agent, summary, session-${sessionId}]`);
    sections.push('---');
    sections.push('');

    // Title
    sections.push(`# Session ${sessionId} Summary`);
    sections.push('');
    sections.push(`**Date**: ${timestamp.toLocaleString()}`);
    sections.push(`**Status**: ${results.success ? '✅ Success' : '❌ Failed'}`);
    sections.push(`**Retries**: ${results.retryCount || 0}`);
    sections.push('');

    // Phase Links
    sections.push('## Phases');
    sections.push('');
    ['plan', 'execute', 'test', 'deploy', 'monitor'].forEach(phase => {
      if (results[phase]) {
        const status = results[phase].success ? '✅' : '❌';
        sections.push(`- ${status} [[${dateStr}-session-${sessionId}-${phase}|${capitalize(phase)}]]`);
      }
    });

    await fs.writeFile(filepath, sections.join('\n'), 'utf-8');

    logger.info('Session summary written to Obsidian vault', { sessionId, filename });
  } catch (error) {
    logger.warn('Failed to write session summary', { sessionId, error: error.message });
  }
}

export default {
  initializeVault,
  writePhaseNote,
  writeSessionSummary
};
