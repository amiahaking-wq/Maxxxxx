import logger from '../utils/logger.js';

/**
 * Validate user input for Telegram commands
 * @param {string} input - User input to validate
 * @returns {Object} { valid: boolean, sanitized: string, reason: string|null }
 */
export function validateUserInput(input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, sanitized: '', reason: 'Input must be a non-empty string' };
  }

  // Trim and limit length (max 4000 chars for Telegram)
  const sanitized = input.trim().substring(0, 4000);

  if (sanitized.length === 0) {
    return { valid: false, sanitized: '', reason: 'Input cannot be empty' };
  }

  // Check for excessive special characters (potential injection)
  const specialCharCount = (sanitized.match(/[<>{}[\]]/g) || []).length;
  if (specialCharCount > 50) {
    return { valid: false, sanitized, reason: 'Too many special characters' };
  }

  return { valid: true, sanitized, reason: null };
}

/**
 * Validate GitHub repository name
 * @param {string} repoName - Repository name to validate
 * @returns {boolean} True if valid
 */
export function validateRepoName(repoName) {
  if (!repoName || typeof repoName !== 'string') {
    return false;
  }

  // GitHub repo name rules: alphanumeric, hyphens, underscores, dots
  const repoRegex = /^[a-zA-Z0-9._-]+$/;
  return repoRegex.test(repoName) && repoName.length <= 100;
}

/**
 * Validate GitHub username/organization
 * @param {string} username - Username to validate
 * @returns {boolean} True if valid
 */
export function validateGitHubUsername(username) {
  if (!username || typeof username !== 'string') {
    return false;
  }

  // GitHub username rules: alphanumeric and hyphens, can't start with hyphen
  const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
  return usernameRegex.test(username) && username.length <= 39;
}

/**
 * Validate PR number
 * @param {string|number} prNumber - PR number to validate
 * @returns {boolean} True if valid
 */
export function validatePRNumber(prNumber) {
  const num = parseInt(prNumber, 10);
  return Number.isInteger(num) && num > 0 && num <= 999999;
}

/**
 * Validate file path
 * @param {string} filePath - File path to validate
 * @returns {Object} { valid: boolean, reason: string|null }
 */
export function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, reason: 'File path must be a non-empty string' };
  }

  // Prevent path traversal
  if (filePath.includes('..')) {
    return { valid: false, reason: 'Path traversal not allowed' };
  }

  // Prevent absolute paths to sensitive locations
  const sensitivePatterns = [
    /^\/etc\//,
    /^\/root\//,
    /^\/sys\//,
    /^\/proc\//,
    /^\/dev\//,
    /^\/boot\//,
    /^\/bin\//,
    /^\/sbin\//,
    /^\/usr\/bin\//,
    /^\/usr\/sbin\//,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(filePath)) {
      return { valid: false, reason: 'Access to system directories not allowed' };
    }
  }

  // Check file extension is allowed
  const dangerousExtensions = ['.exe', '.dll', '.so', '.dylib', '.app'];
  const hasBlockedExtension = dangerousExtensions.some(ext => filePath.toLowerCase().endsWith(ext));

  if (hasBlockedExtension) {
    return { valid: false, reason: 'Executable files not allowed' };
  }

  return { valid: true, reason: null };
}

/**
 * Validate commit message
 * @param {string} message - Commit message to validate
 * @returns {Object} { valid: boolean, sanitized: string, reason: string|null }
 */
export function validateCommitMessage(message) {
  if (!message || typeof message !== 'string') {
    return { valid: false, sanitized: '', reason: 'Commit message must be a non-empty string' };
  }

  const sanitized = message.trim();

  if (sanitized.length === 0) {
    return { valid: false, sanitized: '', reason: 'Commit message cannot be empty' };
  }

  if (sanitized.length > 500) {
    return { valid: false, sanitized: sanitized.substring(0, 500), reason: 'Commit message too long' };
  }

  return { valid: true, sanitized, reason: null };
}

/**
 * Validate branch name
 * @param {string} branchName - Branch name to validate
 * @returns {boolean} True if valid
 */
export function validateBranchName(branchName) {
  if (!branchName || typeof branchName !== 'string') {
    return false;
  }

  // Git branch name rules
  const branchRegex = /^[a-zA-Z0-9/_.-]+$/;

  // Can't start with . or /
  if (branchName.startsWith('.') || branchName.startsWith('/')) {
    return false;
  }

  // Can't end with .lock
  if (branchName.endsWith('.lock')) {
    return false;
  }

  // Can't contain ..
  if (branchName.includes('..')) {
    return false;
  }

  return branchRegex.test(branchName) && branchName.length <= 255;
}

/**
 * Validate environment variable name
 * @param {string} varName - Environment variable name
 * @returns {boolean} True if valid
 */
export function validateEnvVarName(varName) {
  if (!varName || typeof varName !== 'string') {
    return false;
  }

  // Env var naming convention: uppercase alphanumeric and underscores
  const envVarRegex = /^[A-Z_][A-Z0-9_]*$/;
  return envVarRegex.test(varName) && varName.length <= 100;
}

/**
 * Sanitize HTML/Markdown for Telegram
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeForTelegram(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Escape special Telegram markdown characters
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .substring(0, 4096); // Telegram message limit
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function validateURL(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    // Only allow http and https
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate and sanitize JSON input
 * @param {string} jsonString - JSON string to validate
 * @returns {Object} { valid: boolean, parsed: Object|null, reason: string|null }
 */
export function validateJSON(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    return { valid: false, parsed: null, reason: 'Input must be a non-empty string' };
  }

  try {
    const parsed = JSON.parse(jsonString);
    return { valid: true, parsed, reason: null };
  } catch (error) {
    return { valid: false, parsed: null, reason: `Invalid JSON: ${error.message}` };
  }
}

export default {
  validateUserInput,
  validateRepoName,
  validateGitHubUsername,
  validatePRNumber,
  validateFilePath,
  validateCommitMessage,
  validateBranchName,
  validateEnvVarName,
  sanitizeForTelegram,
  validateURL,
  validateJSON
};
