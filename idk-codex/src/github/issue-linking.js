/**
 * GitHub Issue Linking
 *
 * Links chat sessions to GitHub issues for better tracking and context.
 * Based on Claude Code's issue linking system.
 *
 * Features:
 * - Link session to GitHub issue
 * - Update issue status based on session progress
 * - Auto-close issues on completion
 * - Add session context to issue comments
 *
 * @module github-issue-linking
 */

import { Octokit } from '@octokit/rest';
import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';

/**
 * GitHub Issue Linking Manager
 */
export class GitHubIssueLinking {
  constructor() {
    this.octokit = null;
    this.db = getDatabase();
    this.initialized = false;
  }

  /**
   * Initialize Octokit client
   *
   * @returns {boolean} True if initialized
   */
  initialize() {
    if (this.initialized) {
      return true;
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      logger.warn('GitHub token not configured, issue linking disabled');
      return false;
    }

    this.octokit = new Octokit({ auth: token });
    this.initialized = true;

    logger.info('GitHub issue linking initialized');
    return true;
  }

  /**
   * Link a session to a GitHub issue
   *
   * @param {number} sessionId - Session ID
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @returns {Promise<Object>} Link result
   */
  async linkIssueToChat(sessionId, owner, repo, issueNumber) {
    if (!this.initialize()) {
      return {
        success: false,
        error: 'GitHub not configured'
      };
    }

    try {
      // Verify issue exists
      const { data: issue } = await this.octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber
      });

      // Store link in database
      const linkedIssue = JSON.stringify({
        owner,
        repo,
        number: issueNumber,
        title: issue.title,
        url: issue.html_url,
        linkedAt: new Date().toISOString()
      });

      this.db.prepare(`
        UPDATE sessions
        SET linked_issue = ?
        WHERE id = ?
      `).run(linkedIssue, sessionId);

      logger.info('Issue linked to session', {
        sessionId,
        issueUrl: issue.html_url
      });

      // Add comment to issue
      await this.addSessionComment(owner, repo, issueNumber, sessionId, 'linked');

      return {
        success: true,
        issue: {
          owner,
          repo,
          number: issueNumber,
          title: issue.title,
          url: issue.html_url
        }
      };

    } catch (error) {
      logger.error('Failed to link issue to session', {
        sessionId,
        owner,
        repo,
        issueNumber,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get linked issue for session
   *
   * @param {number} sessionId - Session ID
   * @returns {Object|null} Linked issue or null
   */
  getLinkedIssue(sessionId) {
    try {
      const session = this.db.prepare(`
        SELECT linked_issue FROM sessions WHERE id = ?
      `).get(sessionId);

      if (!session || !session.linked_issue) {
        return null;
      }

      return JSON.parse(session.linked_issue);

    } catch (error) {
      logger.error('Failed to get linked issue', {
        sessionId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Update issue status based on session progress
   *
   * @param {number} sessionId - Session ID
   * @param {string} status - Status (in_progress, completed, failed)
   * @param {Object} details - Additional details
   * @returns {Promise<Object>} Update result
   */
  async updateIssueStatus(sessionId, status, details = {}) {
    if (!this.initialize()) {
      return {
        success: false,
        error: 'GitHub not configured'
      };
    }

    const linkedIssue = this.getLinkedIssue(sessionId);

    if (!linkedIssue) {
      logger.debug('No linked issue for session', { sessionId });
      return {
        success: false,
        error: 'No linked issue'
      };
    }

    try {
      const { owner, repo, number } = linkedIssue;

      // Add status comment
      await this.addSessionComment(owner, repo, number, sessionId, status, details);

      logger.info('Issue status updated', {
        sessionId,
        issueNumber: number,
        status
      });

      return {
        success: true,
        issue: linkedIssue
      };

    } catch (error) {
      logger.error('Failed to update issue status', {
        sessionId,
        status,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Close issue on session completion
   *
   * @param {number} sessionId - Session ID
   * @param {Object} completionDetails - Completion details
   * @returns {Promise<Object>} Close result
   */
  async closeIssueOnCompletion(sessionId, completionDetails = {}) {
    if (!this.initialize()) {
      return {
        success: false,
        error: 'GitHub not configured'
      };
    }

    const linkedIssue = this.getLinkedIssue(sessionId);

    if (!linkedIssue) {
      return {
        success: false,
        error: 'No linked issue'
      };
    }

    try {
      const { owner, repo, number } = linkedIssue;

      // Add completion comment
      await this.addSessionComment(
        owner,
        repo,
        number,
        sessionId,
        'completed',
        completionDetails
      );

      // Close issue
      await this.octokit.issues.update({
        owner,
        repo,
        issue_number: number,
        state: 'closed'
      });

      logger.info('Issue closed on completion', {
        sessionId,
        issueNumber: number
      });

      return {
        success: true,
        issue: linkedIssue
      };

    } catch (error) {
      logger.error('Failed to close issue', {
        sessionId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add session progress comment to issue
   *
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} issueNumber - Issue number
   * @param {number} sessionId - Session ID
   * @param {string} status - Status
   * @param {Object} details - Additional details
   * @returns {Promise<void>}
   */
  async addSessionComment(owner, repo, issueNumber, sessionId, status, details = {}) {
    try {
      let body = '';

      if (status === 'linked') {
        body = `🤖 **MAX Agent Session Linked**\n\n`;
        body += `Session ID: \`${sessionId}\`\n`;
        body += `Status: Started working on this issue\n\n`;
        body += `I'll keep this issue updated with my progress.`;

      } else if (status === 'in_progress') {
        body = `🔄 **Session Update**\n\n`;
        body += `Session ID: \`${sessionId}\`\n`;
        body += `Status: In Progress\n\n`;

        if (details.phase) {
          body += `Current Phase: **${details.phase}**\n`;
        }

        if (details.filesModified && details.filesModified.length > 0) {
          body += `\nFiles Modified:\n`;
          for (const file of details.filesModified.slice(0, 10)) {
            body += `- \`${file}\`\n`;
          }
        }

      } else if (status === 'completed') {
        body = `✅ **Session Completed**\n\n`;
        body += `Session ID: \`${sessionId}\`\n`;
        body += `Status: Successfully Completed\n\n`;

        if (details.filesModified && details.filesModified.length > 0) {
          body += `Files Modified: ${details.filesModified.length}\n`;
        }

        if (details.commitHash) {
          body += `Commit: \`${details.commitHash}\`\n`;
        }

        if (details.testsPassed !== undefined) {
          body += `Tests: ${details.testsPassed ? '✓ Passed' : '✗ Failed'}\n`;
        }

        body += `\nThis issue has been resolved by MAX Agent.`;

      } else if (status === 'failed') {
        body = `❌ **Session Failed**\n\n`;
        body += `Session ID: \`${sessionId}\`\n`;
        body += `Status: Failed\n\n`;

        if (details.error) {
          body += `Error: ${details.error}\n\n`;
        }

        body += `Manual intervention may be required.`;
      }

      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body
      });

      logger.debug('Added comment to issue', {
        issueNumber,
        status
      });

    } catch (error) {
      logger.error('Failed to add comment to issue', {
        issueNumber,
        error: error.message
      });
      // Don't throw - commenting is non-critical
    }
  }

  /**
   * Find or create issue for task
   *
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} title - Issue title
   * @param {string} body - Issue body
   * @param {Array<string>} labels - Issue labels
   * @returns {Promise<Object>} Issue details
   */
  async findOrCreateIssue(owner, repo, title, body, labels = []) {
    if (!this.initialize()) {
      return {
        success: false,
        error: 'GitHub not configured'
      };
    }

    try {
      // Search for existing open issue with same title
      const { data: issues } = await this.octokit.issues.listForRepo({
        owner,
        repo,
        state: 'open',
        per_page: 100
      });

      const existingIssue = issues.find(issue => issue.title === title);

      if (existingIssue) {
        logger.info('Found existing issue', {
          issueNumber: existingIssue.number,
          title
        });

        return {
          success: true,
          issue: {
            owner,
            repo,
            number: existingIssue.number,
            title: existingIssue.title,
            url: existingIssue.html_url,
            created: false
          }
        };
      }

      // Create new issue
      const { data: newIssue } = await this.octokit.issues.create({
        owner,
        repo,
        title,
        body,
        labels: ['max-agent', ...labels]
      });

      logger.info('Created new issue', {
        issueNumber: newIssue.number,
        title
      });

      return {
        success: true,
        issue: {
          owner,
          repo,
          number: newIssue.number,
          title: newIssue.title,
          url: newIssue.html_url,
          created: true
        }
      };

    } catch (error) {
      logger.error('Failed to find or create issue', {
        title,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Unlink issue from session
   *
   * @param {number} sessionId - Session ID
   * @returns {boolean} Success
   */
  unlinkIssue(sessionId) {
    try {
      this.db.prepare(`
        UPDATE sessions
        SET linked_issue = NULL
        WHERE id = ?
      `).run(sessionId);

      logger.info('Issue unlinked from session', { sessionId });
      return true;

    } catch (error) {
      logger.error('Failed to unlink issue', {
        sessionId,
        error: error.message
      });
      return false;
    }
  }
}

/**
 * Singleton instance
 */
export const issueLinking = new GitHubIssueLinking();

export default GitHubIssueLinking;
