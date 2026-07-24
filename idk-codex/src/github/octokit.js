import { Octokit } from '@octokit/rest';
import logger from '../utils/logger.js';

export const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  userAgent: 'MAX-Agent/2.0.0',
  baseUrl: 'https://api.github.com',
  headers: {
    'X-GitHub-Api-Version': '2022-11-28'
  }
});

export const REPO_OWNER = process.env.GITHUB_OWNER || process.env.GITHUB_REPO_OWNER;
export const REPO_NAME = process.env.GITHUB_REPO || process.env.GITHUB_REPO_NAME;

/**
 * Get repository information
 * @returns {Promise<Object>} Repository data
 */
export async function getRepository() {
  try {
    const { data } = await octokit.repos.get({
      owner: REPO_OWNER,
      repo: REPO_NAME
    });

    logger.info('Fetched repository info', {
      name: data.name,
      private: data.private,
      defaultBranch: data.default_branch
    });

    return data;
  } catch (error) {
    logger.error('Failed to fetch repository', { error: error.message });
    throw error;
  }
}

/**
 * Get repository contents
 * @param {string} path - Path to fetch
 * @param {string} ref - Branch/commit ref
 * @returns {Promise<Array|Object>} Contents data
 */
export async function getContents(path = '', ref = null) {
  try {
    const params = {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path
    };

    if (ref) {
      params.ref = ref;
    }

    const { data } = await octokit.repos.getContent(params);
    return data;
  } catch (error) {
    logger.error('Failed to fetch contents', { path, error: error.message });
    throw error;
  }
}

/**
 * Get file content from repository
 * @param {string} path - File path
 * @param {string} ref - Branch/commit ref
 * @returns {Promise<string>} File content
 */
export async function getFileContent(path, ref = null) {
  try {
    const data = await getContents(path, ref);

    if (data.type !== 'file') {
      throw new Error(`${path} is not a file`);
    }

    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return content;
  } catch (error) {
    logger.error('Failed to fetch file content', { path, error: error.message });
    throw error;
  }
}

/**
 * Create or update file in repository
 * @param {string} path - File path
 * @param {string} content - File content
 * @param {string} message - Commit message
 * @param {string} branch - Branch name
 * @returns {Promise<Object>} Commit data
 */
export async function createOrUpdateFile(path, content, message, branch = 'main') {
  try {
    // Check if file exists to get SHA
    let sha = null;
    try {
      const existing = await getContents(path, branch);
      sha = existing.sha;
    } catch (error) {
      // File doesn't exist, that's fine
    }

    const params = {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
      branch
    };

    if (sha) {
      params.sha = sha;
    }

    const { data } = await octokit.repos.createOrUpdateFileContents(params);
    logger.info('Created/updated file', { path, branch });

    return data;
  } catch (error) {
    logger.error('Failed to create/update file', { path, error: error.message });
    throw error;
  }
}

/**
 * Create a new branch
 * @param {string} branchName - New branch name
 * @param {string} fromBranch - Source branch
 * @returns {Promise<Object>} Branch data
 */
export async function createBranch(branchName, fromBranch = 'main') {
  try {
    // Get the SHA of the source branch
    const { data: refData } = await octokit.git.getRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${fromBranch}`
    });

    // Create new branch
    const { data } = await octokit.git.createRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha
    });

    logger.info('Created branch', { branchName, fromBranch });
    return data;
  } catch (error) {
    logger.error('Failed to create branch', { branchName, error: error.message });
    throw error;
  }
}

/**
 * Get commit information
 * @param {string} sha - Commit SHA
 * @returns {Promise<Object>} Commit data
 */
export async function getCommit(sha) {
  try {
    const { data } = await octokit.repos.getCommit({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: sha
    });

    return data;
  } catch (error) {
    logger.error('Failed to fetch commit', { sha, error: error.message });
    throw error;
  }
}

/**
 * List commits
 * @param {string} sha - Branch/commit SHA
 * @param {number} perPage - Number of commits per page
 * @returns {Promise<Array>} List of commits
 */
export async function listCommits(sha = 'main', perPage = 10) {
  try {
    const { data } = await octokit.repos.listCommits({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      sha,
      per_page: perPage
    });

    return data;
  } catch (error) {
    logger.error('Failed to list commits', { sha, error: error.message });
    throw error;
  }
}

/**
 * Get authenticated user
 * @returns {Promise<Object>} User data
 */
export async function getAuthenticatedUser() {
  try {
    const { data } = await octokit.users.getAuthenticated();
    return data;
  } catch (error) {
    logger.error('Failed to get authenticated user', { error: error.message });
    throw error;
  }
}

/**
 * Check if GitHub token is valid
 * @returns {Promise<boolean>} True if valid
 */
export async function validateToken() {
  try {
    await getAuthenticatedUser();
    return true;
  } catch (error) {
    return false;
  }
}

export default {
  octokit,
  getRepository,
  getContents,
  getFileContent,
  createOrUpdateFile,
  createBranch,
  getCommit,
  listCommits,
  getAuthenticatedUser,
  validateToken,
  REPO_OWNER,
  REPO_NAME
};
