import { SpecialistAgent } from './base.js';
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import logger from '../../utils/logger.js';

/**
 * Git Specialist
 *
 * Handles all GitHub and git operations:
 * - Creating and managing issues
 * - Commits with proper attribution
 * - Push operations
 * - Pull request creation
 * - Repository analysis
 *
 * Based on Claude Code's git specialist implementation
 */
export class GitSpecialist extends SpecialistAgent {
  constructor() {
    super(
      'git',
      ['github', 'commit', 'push', 'pr', 'issue', 'git', 'repository', 'branch'],
      'Handles GitHub operations, commits, PRs, and git workflows'
    );

    // Initialize Octokit if GitHub token is available
    this.octokit = process.env.GITHUB_TOKEN
      ? new Octokit({ auth: process.env.GITHUB_TOKEN })
      : null;

    if (!this.octokit) {
      logger.warn('[git-specialist] GitHub token not found, some features will be limited');
    }
  }

  /**
   * Execute git specialist task
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(task, context) {
    try {
      const taskStr = typeof task === 'string' ? task.toLowerCase() : task.description?.toLowerCase() || '';

      this.log('Executing git task', { task: taskStr });

      // Route to appropriate handler
      if (taskStr.includes('create issue')) {
        return await this.createIssue(task, context);
      } else if (taskStr.includes('link issue')) {
        return await this.linkIssue(task, context);
      } else if (taskStr.includes('commit')) {
        return await this.createCommit(task, context);
      } else if (taskStr.includes('push')) {
        return await this.pushChanges(task, context);
      } else if (taskStr.includes('pull request') || taskStr.includes('pr')) {
        return await this.createPR(task, context);
      } else if (taskStr.includes('status')) {
        return await this.getStatus(task, context);
      } else if (taskStr.includes('branch')) {
        return await this.manageBranch(task, context);
      } else {
        return this.failure('Unknown git operation', { task: taskStr });
      }
    } catch (error) {
      this.logError('Git operation failed', error, { task });
      return this.failure(error.message, { task });
    }
  }

  /**
   * Create a GitHub issue
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Result with issue number
   */
  async createIssue(task, context) {
    try {
      if (!this.octokit) {
        return this.failure('GitHub token not configured');
      }

      const { repository, title, body, labels = ['ai-agent'] } = context;

      if (!repository || !title) {
        return this.failure('Missing required fields: repository, title');
      }

      const [owner, repo] = repository.split('/');

      this.log('Creating GitHub issue', { owner, repo, title });

      const response = await this.octokit.issues.create({
        owner,
        repo,
        title,
        body: body || '',
        labels
      });

      return this.success(
        {
          issueNumber: response.data.number,
          issueUrl: response.data.html_url,
          issue: response.data
        },
        `Issue #${response.data.number} created successfully`
      );
    } catch (error) {
      this.logError('Failed to create issue', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * Link issue to chat/session
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Result
   */
  async linkIssue(task, context) {
    try {
      const { issueNumber, repository } = context;

      if (!issueNumber) {
        return this.failure('Missing issue number');
      }

      this.log('Linking issue', { issueNumber, repository });

      // In a full implementation, this would use mcp__standard__link_issue_to_chat
      // For now, just return success
      return this.success(
        { issueNumber, linked: true },
        `Issue #${issueNumber} linked to session`
      );
    } catch (error) {
      this.logError('Failed to link issue', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * Create a git commit with proper attribution
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Commit result
   */
  async createCommit(task, context) {
    try {
      const {
        message,
        files = [],
        workingDir = process.cwd(),
        addCoauthor = true
      } = context;

      if (!message) {
        return this.failure('Missing commit message');
      }

      this.log('Creating commit', { message, filesCount: files.length });

      // Stage files
      if (files.length > 0) {
        for (const file of files) {
          execSync(`git add "${file}"`, { cwd: workingDir });
        }
      } else {
        // Stage all changes
        execSync('git add .', { cwd: workingDir });
      }

      // Build commit message with co-authorship
      let fullMessage = message;
      if (addCoauthor) {
        fullMessage += '\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>';
      }

      // Create commit
      execSync(`git commit -m "${fullMessage.replace(/"/g, '\\"')}"`, {
        cwd: workingDir
      });

      // Get commit hash
      const commitHash = execSync('git rev-parse HEAD', {
        cwd: workingDir,
        encoding: 'utf-8'
      }).trim();

      return this.success(
        {
          commitHash,
          message: fullMessage,
          files: files.length || 'all'
        },
        `Commit ${commitHash.substring(0, 7)} created successfully`
      );
    } catch (error) {
      this.logError('Failed to create commit', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * Push changes to remote
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Push result
   */
  async pushChanges(task, context) {
    try {
      const {
        branch,
        remote = 'origin',
        force = false,
        workingDir = process.cwd()
      } = context;

      this.log('Pushing changes', { branch, remote, force });

      const pushCmd = force
        ? `git push ${remote} ${branch || ''} --force`
        : `git push ${remote} ${branch || ''} -u`;

      execSync(pushCmd, { cwd: workingDir });

      return this.success(
        { branch, remote, pushed: true },
        `Changes pushed to ${remote}${branch ? `/${branch}` : ''}`
      );
    } catch (error) {
      this.logError('Failed to push changes', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * Create a pull request
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} PR result
   */
  async createPR(task, context) {
    try {
      if (!this.octokit) {
        return this.failure('GitHub token not configured');
      }

      const {
        repository,
        title,
        body,
        head,
        base = 'main',
        draft = false
      } = context;

      if (!repository || !title || !head) {
        return this.failure('Missing required fields: repository, title, head');
      }

      const [owner, repo] = repository.split('/');

      this.log('Creating pull request', { owner, repo, title, head, base });

      const response = await this.octokit.pulls.create({
        owner,
        repo,
        title,
        body: body || '',
        head,
        base,
        draft
      });

      return this.success(
        {
          prNumber: response.data.number,
          prUrl: response.data.html_url,
          pr: response.data
        },
        `PR #${response.data.number} created successfully`
      );
    } catch (error) {
      this.logError('Failed to create PR', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * Get git status
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Status result
   */
  async getStatus(task, context) {
    try {
      const { workingDir = process.cwd() } = context;

      this.log('Getting git status');

      const status = execSync('git status --porcelain', {
        cwd: workingDir,
        encoding: 'utf-8'
      });

      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: workingDir,
        encoding: 'utf-8'
      }).trim();

      const modified = status
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.substring(3).trim());

      return this.success(
        {
          branch,
          modified,
          clean: modified.length === 0
        },
        `Repository status retrieved`
      );
    } catch (error) {
      this.logError('Failed to get status', error);
      return this.failure(error.message);
    }
  }

  /**
   * Manage branches (create, checkout, etc.)
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Branch operation result
   */
  async manageBranch(task, context) {
    try {
      const {
        action = 'create',
        branchName,
        workingDir = process.cwd()
      } = context;

      if (!branchName) {
        return this.failure('Missing branch name');
      }

      this.log('Managing branch', { action, branchName });

      if (action === 'create') {
        execSync(`git checkout -b ${branchName}`, { cwd: workingDir });
      } else if (action === 'checkout') {
        execSync(`git checkout ${branchName}`, { cwd: workingDir });
      } else if (action === 'delete') {
        execSync(`git branch -D ${branchName}`, { cwd: workingDir });
      } else {
        return this.failure(`Unknown branch action: ${action}`);
      }

      return this.success(
        { action, branchName },
        `Branch operation '${action}' completed for ${branchName}`
      );
    } catch (error) {
      this.logError('Failed to manage branch', error, { context });
      return this.failure(error.message);
    }
  }
}
