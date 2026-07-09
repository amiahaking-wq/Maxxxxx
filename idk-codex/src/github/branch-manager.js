/**
 * GitHub Branch Manager
 *
 * Handles automatic feature branch creation, conventional commit generation,
 * and branch tracking for autonomous task execution.
 *
 * Features:
 * - Automatic feature branch naming (max/task-{id}-{slug})
 * - Conventional commit message generation (type, scope, breaking changes)
 * - Branch tracking URL generation
 * - Git operations with error handling
 *
 * @module branch-manager
 */

import simpleGit from 'simple-git';
import logger from '../utils/logger.js';
import path from 'path';

export class GitHubBranchManager {
  constructor(workspaceDir) {
    this.workspaceDir = workspaceDir || process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
    this.git = simpleGit(this.workspaceDir);
  }

  /**
   * Create feature branch for task execution
   *
   * Branch naming: max/task-{shortId}-{slug}
   * Example: max/task-abc123-add-auth-endpoint
   *
   * @param {string} sessionId - Session ID (e.g., session-1234567890)
   * @param {string} taskDescription - Task description
   * @returns {Promise<string>} Branch name
   */
  async createTaskBranch(sessionId, taskDescription) {
    try {
      // Extract short ID from session ID
      const shortId = sessionId.split('-')[1]?.substring(0, 6) || 'unknown';

      // Generate slug from task description
      const slug = this.generateSlug(taskDescription);

      // Construct branch name
      const branchName = `max/task-${shortId}-${slug}`;

      logger.info('Creating feature branch', { branchName, sessionId });

      // Check if branch already exists
      const branches = await this.git.branchLocal();
      const branchExists = branches.all.includes(branchName);

      if (branchExists) {
        logger.info('Branch already exists, checking out', { branchName });
        await this.git.checkout(branchName);
        return branchName;
      }

      // Get default branch (main or master)
      const defaultBranch = await this.getDefaultBranch();

      // Ensure we're on default branch before creating new branch
      await this.git.checkout(defaultBranch);

      // Pull latest changes
      await this.git.pull('origin', defaultBranch);

      // Create and checkout new branch
      await this.git.checkoutBranch(branchName, defaultBranch);

      logger.info('Created feature branch', {
        branchName,
        base: defaultBranch,
        sessionId
      });

      return branchName;

    } catch (error) {
      logger.error('Failed to create feature branch', {
        error: error.message,
        sessionId,
        stack: error.stack
      });

      throw new Error(`Branch creation failed: ${error.message}`);
    }
  }

  /**
   * Generate URL-safe slug from task description
   *
   * @param {string} description - Task description
   * @returns {string} Slug (max 40 chars)
   */
  generateSlug(description) {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .substring(0, 40) // Limit length
      .replace(/-$/, ''); // Remove trailing hyphen
  }

  /**
   * Get default branch (main or master)
   *
   * @returns {Promise<string>} Default branch name
   */
  async getDefaultBranch() {
    try {
      // Try to get remote default branch
      const remotes = await this.git.getRemotes(true);

      if (remotes.length > 0) {
        // Parse remote info to find HEAD
        const remote = await this.git.listRemote(['--symref', 'origin', 'HEAD']);
        const match = remote.match(/ref: refs\/heads\/(\w+)/);

        if (match) {
          logger.debug('Default branch from remote', { branch: match[1] });
          return match[1];
        }
      }

      // Fallback: Check local branches
      const status = await this.git.status();
      const currentBranch = status.current;

      if (currentBranch === 'main' || currentBranch === 'master') {
        return currentBranch;
      }

      // Default fallback
      logger.warn('Could not determine default branch, using "main"');
      return 'main';

    } catch (error) {
      logger.warn('Error getting default branch, defaulting to "main"', {
        error: error.message
      });
      return 'main';
    }
  }

  /**
   * Check if branch exists
   *
   * @param {string} branchName - Branch name
   * @returns {Promise<boolean>} True if exists
   */
  async branchExists(branchName) {
    try {
      const branches = await this.git.branchLocal();
      return branches.all.includes(branchName);
    } catch (error) {
      logger.error('Error checking branch existence', {
        branchName,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Generate conventional commit message
   *
   * Format: <type>(<scope>): <subject>
   *
   * Types: feat, fix, docs, style, refactor, test, chore
   *
   * @param {Array} filesModified - Modified files with metadata
   * @param {Object} testResults - Test execution results
   * @param {string} taskDescription - Original task description
   * @returns {string} Conventional commit message
   */
  generateConventionalCommit(filesModified, testResults = {}, taskDescription = '') {
    const commitType = this.detectCommitType(filesModified);
    const scope = this.detectScope(filesModified);
    const breaking = this.detectBreakingChanges(filesModified);

    // Generate header
    const header = breaking
      ? `${commitType}(${scope})!: ${this.generateSubject(filesModified, taskDescription)}`
      : `${commitType}(${scope}): ${this.generateSubject(filesModified, taskDescription)}`;

    // Generate body
    const body = this.generateBody(filesModified, testResults, taskDescription);

    // Generate footer
    const footer = this.generateFooter(breaking, testResults);

    // Combine parts
    const parts = [header];

    if (body) {
      parts.push('', body);
    }

    if (footer) {
      parts.push('', footer);
    }

    // Add co-author
    parts.push('', 'Co-Authored-By: MAX Agent <max@agent.dev>');

    return parts.join('\n');
  }

  /**
   * Detect commit type from modified files
   *
   * @param {Array} filesModified - Modified files
   * @returns {string} Commit type
   */
  detectCommitType(filesModified) {
    if (!filesModified || filesModified.length === 0) {
      return 'chore';
    }

    const hasNewFiles = filesModified.some(f => f.status === 'new' || f.status === 'added');
    const hasTests = filesModified.some(f => this.isTestFile(f.path));
    const hasDocs = filesModified.some(f => this.isDocFile(f.path));
    const hasConfig = filesModified.some(f => this.isConfigFile(f.path));

    if (hasDocs && filesModified.length === filesModified.filter(f => this.isDocFile(f.path)).length) {
      return 'docs';
    }

    if (hasTests && !hasNewFiles) {
      return 'test';
    }

    if (hasConfig && filesModified.length === 1) {
      return 'chore';
    }

    if (hasNewFiles && !hasTests) {
      return 'feat';
    }

    if (filesModified.every(f => f.status === 'modified')) {
      // Check if it's a bug fix or refactor
      const hasBugKeywords = filesModified.some(f =>
        /fix|bug|issue|error|crash/i.test(f.path)
      );

      return hasBugKeywords ? 'fix' : 'refactor';
    }

    return 'feat';
  }

  /**
   * Detect scope from modified files
   *
   * @param {Array} filesModified - Modified files
   * @returns {string} Scope
   */
  detectScope(filesModified) {
    if (!filesModified || filesModified.length === 0) {
      return 'general';
    }

    // Extract first directory from file paths
    const directories = filesModified.map(f => {
      const parts = f.path.split(path.sep);
      return parts.length > 1 ? parts[0] : 'root';
    });

    // Find most common directory
    const scopeCount = {};
    directories.forEach(dir => {
      scopeCount[dir] = (scopeCount[dir] || 0) + 1;
    });

    const mostCommonScope = Object.entries(scopeCount)
      .sort((a, b) => b[1] - a[1])[0][0];

    // Map directories to meaningful scopes
    const scopeMap = {
      'src': 'core',
      'lib': 'core',
      'api': 'api',
      'frontend': 'ui',
      'backend': 'api',
      'docs': 'docs',
      'test': 'test',
      'tests': 'test',
      'config': 'config',
      'utils': 'utils',
      'agent': 'agent',
      'bot': 'bot',
      'database': 'db',
      'security': 'security'
    };

    return scopeMap[mostCommonScope] || mostCommonScope || 'general';
  }

  /**
   * Detect breaking changes
   *
   * @param {Array} filesModified - Modified files
   * @returns {boolean} True if breaking changes detected
   */
  detectBreakingChanges(filesModified) {
    if (!filesModified || filesModified.length === 0) {
      return false;
    }

    // Check for breaking change indicators
    const breakingIndicators = [
      /breaking/i,
      /major/i,
      /incompatible/i,
      /removed/i,
      /deprecated/i
    ];

    return filesModified.some(f =>
      breakingIndicators.some(pattern => pattern.test(f.path))
    );
  }

  /**
   * Generate commit subject
   *
   * @param {Array} filesModified - Modified files
   * @param {string} taskDescription - Task description
   * @returns {string} Subject line
   */
  generateSubject(filesModified, taskDescription) {
    // Use task description if available and reasonable length
    if (taskDescription && taskDescription.length > 10 && taskDescription.length < 80) {
      // Clean up task description
      return taskDescription
        .trim()
        .replace(/^(add|create|implement|fix|update|refactor)\s+/i, '')
        .replace(/\.$/, '')
        .toLowerCase();
    }

    // Generate from files
    if (!filesModified || filesModified.length === 0) {
      return 'update codebase';
    }

    if (filesModified.length === 1) {
      const file = path.basename(filesModified[0].path, path.extname(filesModified[0].path));
      return `update ${file}`;
    }

    return `update ${filesModified.length} files`;
  }

  /**
   * Generate commit body
   *
   * @param {Array} filesModified - Modified files
   * @param {Object} testResults - Test results
   * @param {string} taskDescription - Task description
   * @returns {string} Commit body
   */
  generateBody(filesModified, testResults, taskDescription) {
    const lines = [];

    // Add task description if different from subject
    if (taskDescription && taskDescription.length > 80) {
      lines.push(taskDescription.trim());
      lines.push('');
    }

    // Add file changes summary
    if (filesModified && filesModified.length > 0) {
      lines.push('Changes:');

      const grouped = this.groupFilesByType(filesModified);

      Object.entries(grouped).forEach(([type, files]) => {
        if (files.length > 0) {
          lines.push(`- ${type}: ${files.length} file(s)`);
        }
      });

      lines.push('');
    }

    // Add test results if available
    if (testResults && testResults.passed !== undefined) {
      lines.push(`Tests: ${testResults.passed} passed, ${testResults.failed || 0} failed`);
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  /**
   * Group files by type
   *
   * @param {Array} filesModified - Modified files
   * @returns {Object} Grouped files
   */
  groupFilesByType(filesModified) {
    const groups = {
      'New files': [],
      'Modified files': [],
      'Deleted files': [],
      'Renamed files': []
    };

    filesModified.forEach(file => {
      if (file.status === 'new' || file.status === 'added') {
        groups['New files'].push(file);
      } else if (file.status === 'modified') {
        groups['Modified files'].push(file);
      } else if (file.status === 'deleted') {
        groups['Deleted files'].push(file);
      } else if (file.status === 'renamed') {
        groups['Renamed files'].push(file);
      }
    });

    return groups;
  }

  /**
   * Generate commit footer
   *
   * @param {boolean} breaking - Has breaking changes
   * @param {Object} testResults - Test results
   * @returns {string} Footer
   */
  generateFooter(breaking, testResults) {
    const lines = [];

    if (breaking) {
      lines.push('BREAKING CHANGE: This commit introduces breaking changes');
    }

    // Add any additional metadata
    if (testResults && testResults.coverage) {
      lines.push(`Coverage: ${testResults.coverage}%`);
    }

    return lines.join('\n');
  }

  /**
   * Check if file is a test file
   *
   * @param {string} filePath - File path
   * @returns {boolean} True if test file
   */
  isTestFile(filePath) {
    return /\.(test|spec)\.(js|ts|jsx|tsx)$/.test(filePath) ||
           filePath.includes('__tests__') ||
           filePath.includes('/test/') ||
           filePath.includes('/tests/');
  }

  /**
   * Check if file is a documentation file
   *
   * @param {string} filePath - File path
   * @returns {boolean} True if doc file
   */
  isDocFile(filePath) {
    return /\.(md|txt|rst|adoc)$/i.test(filePath) ||
           filePath.includes('/docs/') ||
           filePath.includes('/documentation/');
  }

  /**
   * Check if file is a configuration file
   *
   * @param {string} filePath - File path
   * @returns {boolean} True if config file
   */
  isConfigFile(filePath) {
    const configFiles = [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      '.eslintrc',
      '.prettierrc',
      'webpack.config.js',
      'vite.config.js',
      '.env',
      '.env.example'
    ];

    return configFiles.some(config => filePath.endsWith(config)) ||
           filePath.includes('config/') ||
           filePath.includes('.config.');
  }

  /**
   * Push branch and create tracking URL
   *
   * @param {string} branchName - Branch name
   * @param {string} commitMessage - Commit message
   * @returns {Promise<string>} Tracking URL
   */
  async pushAndTrack(branchName, commitMessage) {
    try {
      logger.info('Staging and committing changes', { branchName });

      // Stage all changes
      await this.git.add('.');

      // Create commit
      await this.git.commit(commitMessage);

      logger.info('Pushing to remote', { branchName });

      // Push with upstream tracking
      await this.git.push('origin', branchName, ['--set-upstream']);

      // Get repository URL
      const repoUrl = await this.getRepositoryUrl();

      // Construct tracking URL
      const trackingUrl = `${repoUrl}/tree/${branchName}`;

      logger.info('Branch pushed successfully', {
        branchName,
        trackingUrl
      });

      return trackingUrl;

    } catch (error) {
      logger.error('Failed to push branch', {
        branchName,
        error: error.message,
        stack: error.stack
      });

      throw new Error(`Branch push failed: ${error.message}`);
    }
  }

  /**
   * Get repository URL from git remote
   *
   * @returns {Promise<string>} Repository URL
   */
  async getRepositoryUrl() {
    try {
      const remotes = await this.git.getRemotes(true);

      if (remotes.length === 0) {
        throw new Error('No git remotes configured');
      }

      // Use origin remote
      const origin = remotes.find(r => r.name === 'origin');

      if (!origin) {
        throw new Error('No origin remote found');
      }

      // Parse URL (handle both SSH and HTTPS)
      let url = origin.refs.fetch;

      // Convert SSH to HTTPS
      if (url.startsWith('git@github.com:')) {
        url = url.replace('git@github.com:', 'https://github.com/');
      }

      // Remove .git suffix
      url = url.replace(/\.git$/, '');

      return url;

    } catch (error) {
      logger.error('Failed to get repository URL', {
        error: error.message
      });

      // Fallback to environment variables
      const owner = process.env.GITHUB_OWNER || process.env.GITHUB_REPO_OWNER;
      const repo = process.env.GITHUB_REPO || process.env.GITHUB_REPO_NAME;

      if (owner && repo) {
        return `https://github.com/${owner}/${repo}`;
      }

      throw new Error('Could not determine repository URL');
    }
  }

  /**
   * Get current branch name
   *
   * @returns {Promise<string>} Current branch
   */
  async getCurrentBranch() {
    try {
      const status = await this.git.status();
      return status.current;
    } catch (error) {
      logger.error('Failed to get current branch', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get commit SHA
   *
   * @returns {Promise<string>} Latest commit SHA
   */
  async getLatestCommitSha() {
    try {
      const log = await this.git.log({ maxCount: 1 });
      return log.latest.hash;
    } catch (error) {
      logger.error('Failed to get latest commit SHA', {
        error: error.message
      });
      throw error;
    }
  }
}

export default GitHubBranchManager;
