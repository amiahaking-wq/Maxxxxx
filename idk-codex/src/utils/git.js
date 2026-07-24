import simpleGit from 'simple-git';
import { getAbsolutePath } from './filesystem.js';
import logger from './logger.js';

const SANDBOX_WORKSPACE = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

/**
 * Get git instance for sandbox workspace
 * @returns {SimpleGit} Git instance
 */
export function getGit() {
  const git = simpleGit({
    baseDir: getAbsolutePath('.'),
    binary: 'git',
    maxConcurrentProcesses: 1,
    trimmed: false,
  });

  return git;
}

/**
 * Initialize git repository in sandbox
 * @returns {Promise<void>}
 */
export async function initRepository() {
  try {
    const git = getGit();
    await git.init();
    logger.info('Initialized git repository');
  } catch (error) {
    logger.error('Failed to initialize repository', { error: error.message });
    throw error;
  }
}

/**
 * Clone repository into sandbox
 * @param {string} repoUrl - Repository URL
 * @param {string} branch - Branch to clone (optional)
 * @returns {Promise<void>}
 */
export async function cloneRepository(repoUrl, branch = null) {
  try {
    const git = getGit();
    const options = branch ? ['--branch', branch] : [];
    await git.clone(repoUrl, getAbsolutePath('.'), options);
    logger.info('Cloned repository', { repoUrl, branch });
  } catch (error) {
    logger.error('Failed to clone repository', { repoUrl, error: error.message });
    throw error;
  }
}

/**
 * Check repository status
 * @returns {Promise<Object>} Status object
 */
export async function getStatus() {
  try {
    const git = getGit();
    const status = await git.status();
    logger.debug('Got git status', {
      modified: status.modified.length,
      created: status.created.length,
      deleted: status.deleted.length
    });
    return status;
  } catch (error) {
    logger.error('Failed to get status', { error: error.message });
    throw error;
  }
}

/**
 * Add files to staging
 * @param {Array<string>|string} files - Files to add (or '.' for all)
 * @returns {Promise<void>}
 */
export async function addFiles(files = '.') {
  try {
    const git = getGit();
    await git.add(files);
    logger.info('Added files to staging', { files });
  } catch (error) {
    logger.error('Failed to add files', { files, error: error.message });
    throw error;
  }
}

/**
 * Create commit
 * @param {string} message - Commit message
 * @returns {Promise<Object>} Commit result
 */
export async function createCommit(message) {
  try {
    const git = getGit();
    const result = await git.commit(message);
    logger.info('Created commit', { message, hash: result.commit });
    return result;
  } catch (error) {
    logger.error('Failed to create commit', { message, error: error.message });
    throw error;
  }
}

/**
 * Push commits to remote
 * @param {string} remote - Remote name (default: origin)
 * @param {string} branch - Branch name
 * @returns {Promise<void>}
 */
export async function pushToRemote(remote = 'origin', branch = 'main') {
  try {
    const git = getGit();
    await git.push(remote, branch);
    logger.info('Pushed to remote', { remote, branch });
  } catch (error) {
    logger.error('Failed to push to remote', { remote, branch, error: error.message });
    throw error;
  }
}

/**
 * Pull from remote
 * @param {string} remote - Remote name (default: origin)
 * @param {string} branch - Branch name
 * @returns {Promise<void>}
 */
export async function pullFromRemote(remote = 'origin', branch = 'main') {
  try {
    const git = getGit();
    await git.pull(remote, branch);
    logger.info('Pulled from remote', { remote, branch });
  } catch (error) {
    logger.error('Failed to pull from remote', { remote, branch, error: error.message });
    throw error;
  }
}

/**
 * Create new branch
 * @param {string} branchName - Branch name
 * @param {boolean} checkout - Whether to checkout the branch
 * @returns {Promise<void>}
 */
export async function createBranch(branchName, checkout = true) {
  try {
    const git = getGit();
    if (checkout) {
      await git.checkoutLocalBranch(branchName);
    } else {
      await git.branch([branchName]);
    }
    logger.info('Created branch', { branchName, checkout });
  } catch (error) {
    logger.error('Failed to create branch', { branchName, error: error.message });
    throw error;
  }
}

/**
 * Checkout branch
 * @param {string} branchName - Branch name
 * @returns {Promise<void>}
 */
export async function checkoutBranch(branchName) {
  try {
    const git = getGit();
    await git.checkout(branchName);
    logger.info('Checked out branch', { branchName });
  } catch (error) {
    logger.error('Failed to checkout branch', { branchName, error: error.message });
    throw error;
  }
}

/**
 * Get current branch name
 * @returns {Promise<string>} Current branch name
 */
export async function getCurrentBranch() {
  try {
    const git = getGit();
    const status = await git.status();
    return status.current;
  } catch (error) {
    logger.error('Failed to get current branch', { error: error.message });
    throw error;
  }
}

/**
 * Get commit log
 * @param {number} count - Number of commits to retrieve
 * @returns {Promise<Array>} Array of commit objects
 */
export async function getLog(count = 10) {
  try {
    const git = getGit();
    const log = await git.log({ maxCount: count });
    return log.all;
  } catch (error) {
    logger.error('Failed to get log', { error: error.message });
    throw error;
  }
}

/**
 * Get diff for uncommitted changes
 * @returns {Promise<string>} Diff output
 */
export async function getDiff() {
  try {
    const git = getGit();
    const diff = await git.diff();
    return diff;
  } catch (error) {
    logger.error('Failed to get diff', { error: error.message });
    throw error;
  }
}

/**
 * Configure git user
 * @param {string} name - User name
 * @param {string} email - User email
 * @returns {Promise<void>}
 */
export async function configureUser(name, email) {
  try {
    const git = getGit();
    await git.addConfig('user.name', name);
    await git.addConfig('user.email', email);
    logger.info('Configured git user', { name, email });
  } catch (error) {
    logger.error('Failed to configure user', { error: error.message });
    throw error;
  }
}

/**
 * Add remote repository
 * @param {string} name - Remote name
 * @param {string} url - Remote URL
 * @returns {Promise<void>}
 */
export async function addRemote(name, url) {
  try {
    const git = getGit();
    await git.addRemote(name, url);
    logger.info('Added remote', { name, url });
  } catch (error) {
    logger.error('Failed to add remote', { name, url, error: error.message });
    throw error;
  }
}

/**
 * Check if repository has uncommitted changes
 * @returns {Promise<boolean>} True if there are changes
 */
export async function hasChanges() {
  try {
    const status = await getStatus();
    return status.modified.length > 0 ||
           status.created.length > 0 ||
           status.deleted.length > 0 ||
           status.renamed.length > 0;
  } catch (error) {
    logger.error('Failed to check for changes', { error: error.message });
    throw error;
  }
}

/**
 * Reset repository to clean state
 * @param {boolean} hard - Whether to do hard reset
 * @returns {Promise<void>}
 */
export async function resetRepository(hard = false) {
  try {
    const git = getGit();
    if (hard) {
      await git.reset(['--hard']);
    } else {
      await git.reset();
    }
    logger.info('Reset repository', { hard });
  } catch (error) {
    logger.error('Failed to reset repository', { error: error.message });
    throw error;
  }
}

export default {
  getGit,
  initRepository,
  cloneRepository,
  getStatus,
  addFiles,
  createCommit,
  pushToRemote,
  pullFromRemote,
  createBranch,
  checkoutBranch,
  getCurrentBranch,
  getLog,
  getDiff,
  configureUser,
  addRemote,
  hasChanges,
  resetRepository
};
