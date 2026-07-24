/**
 * GitHub Connector Module
 * Integrates Octokit and simple-git for seamless GitHub operations
 * Provides commit, push, PR creation, and issue management
 */

import { octokit, REPO_OWNER, REPO_NAME, createOrUpdateFile } from '../github/octokit.js';
import { getGit, addFiles, createCommit, pushToRemote, getCurrentBranch, hasChanges } from '../utils/git.js';
import logger from '../utils/logger.js';

/**
 * Commit and push changes to GitHub repository
 * @param {string} sessionId - Session identifier
 * @param {Array<string>} filesModified - List of modified file paths
 * @param {string} commitMessage - Commit message
 * @param {Object} options - Additional options
 * @param {string} options.branch - Target branch (default: 'main')
 * @param {string} options.coAuthor - Co-author attribution
 * @param {boolean} options.skipPush - Skip pushing to remote
 * @returns {Promise<Object>} Result object with success status, commit SHA, and branch
 */
export async function commitAndPushChanges(sessionId, filesModified = [], commitMessage, options = {}) {
  const {
    branch = 'main',
    coAuthor = 'MAX Agent <max@autonomous-agent.dev>',
    skipPush = false
  } = options;

  try {
    logger.info('GitHub Connector: Starting commit and push', {
      sessionId,
      filesCount: filesModified.length,
      branch
    });

    // Check if there are any changes
    const changesExist = await hasChanges();
    if (!changesExist && filesModified.length === 0) {
      logger.info('No changes to commit');
      return { success: true, message: 'No changes to commit', skipped: true };
    }

    // Stage files
    if (filesModified.length > 0) {
      logger.info('Staging specific files', { files: filesModified });
      await addFiles(filesModified);
    } else {
      logger.info('Staging all changes');
      await addFiles('.');
    }

    // Create commit with co-author
    const fullCommitMessage = `${commitMessage}\n\n${coAuthor ? `Co-Authored-By: ${coAuthor}` : ''}`;
    const commitResult = await createCommit(fullCommitMessage);
    logger.info('Created commit', { sha: commitResult.commit });

    // Push to remote (unless skipped)
    if (!skipPush) {
      const currentBranch = await getCurrentBranch();
      await pushToRemote('origin', currentBranch);
      logger.info('Pushed to remote', { branch: currentBranch });

      return {
        success: true,
        commit: commitResult.commit,
        branch: currentBranch,
        message: commitMessage
      };
    }

    return {
      success: true,
      commit: commitResult.commit,
      branch: await getCurrentBranch(),
      message: commitMessage,
      pushed: false
    };

  } catch (error) {
    logger.error('Failed to commit and push changes', {
      sessionId,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a pull request on GitHub
 * @param {string} title - PR title
 * @param {string} body - PR description
 * @param {string} head - Head branch
 * @param {string} base - Base branch (default: 'main')
 * @returns {Promise<Object>} Result object with PR data
 */
export async function createPullRequest(title, body, head, base = 'main') {
  try {
    const { data } = await octokit.pulls.create({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      title,
      body,
      head,
      base
    });

    logger.info('Created pull request', {
      number: data.number,
      title: data.title,
      url: data.html_url
    });

    return { success: true, pr: data };
  } catch (error) {
    logger.error('Failed to create pull request', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Update a GitHub issue with a comment
 * @param {number} issueNumber - Issue number
 * @param {string} comment - Comment text
 * @returns {Promise<Object>} Result object
 */
export async function updateIssue(issueNumber, comment) {
  try {
    const { data } = await octokit.issues.createComment({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: issueNumber,
      body: comment
    });

    logger.info('Added comment to issue', { issueNumber });
    return { success: true, comment: data };
  } catch (error) {
    logger.error('Failed to update issue', { issueNumber, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Verify branch protection rules
 * @param {string} branch - Branch name (default: 'main')
 * @returns {Promise<Object>} Protection status with requiresPR and requiresReviews
 */
export async function checkBranchProtection(branch = 'main') {
  try {
    const { data } = await octokit.repos.getBranchProtection({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      branch
    });

    return {
      protected: true,
      requiresPR: data.required_pull_request_reviews !== null,
      requiresReviews: data.required_pull_request_reviews?.required_approving_review_count || 0
    };
  } catch (error) {
    if (error.status === 404) {
      return { protected: false };
    }
    throw error;
  }
}

export default {
  commitAndPushChanges,
  createPullRequest,
  updateIssue,
  checkBranchProtection
};
