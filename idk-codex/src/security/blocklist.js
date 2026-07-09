import logger from '../utils/logger.js';

/**
 * Dangerous command patterns that should be blocked
 * These patterns detect potentially harmful commands
 */
const DANGEROUS_PATTERNS = [
  // Destructive file operations
  /rm\s+-rf\s+\//,
  /rm\s+-fr\s+\//,
  /rm\s+--recursive\s+--force\s+\//,
  /rm\s+-r\s+\//,

  // Permission changes
  /chmod\s+777/,
  /chmod\s+-R\s+777/,
  /chown\s+/,
  /chgrp\s+/,

  // Privilege escalation
  /sudo\s+/,
  /su\s+/,
  /su\s+-/,
  /sudo su/,

  // Environment file manipulation
  /\.env/,
  /echo\s+.*>\s*\.env/,
  /cat\s+.*>\s*\.env/,

  // System configuration
  /\/etc\/passwd/,
  /\/etc\/shadow/,
  /\/etc\/sudoers/,

  // Network attacks
  /nc\s+-l/,
  /netcat/,
  /ncat/,

  // Code injection
  /eval\s*\(/,
  /exec\s*\(/,
  /system\s*\(/,

  // Package manager tampering
  /npm\s+config\s+set/,
  /yarn\s+config\s+set/,

  // Git configuration tampering
  /git\s+config\s+--global/,
  /git\s+config\s+--system/,

  // Shell escapes
  /;\s*bash/,
  /\|\s*sh/,
  /\|\s*bash/,
  /`.*`/,
  /\$\(.*\)/,

  // Disk operations
  /dd\s+if=/,
  /mkfs/,
  /fdisk/,

  // Process manipulation
  /kill\s+-9\s+1/,
  /killall\s+-9/,
  /pkill\s+-9/,

  // Cron manipulation
  /crontab\s+-e/,
  /crontab\s+-l/,

  // SSH key manipulation
  /ssh-keygen/,
  /authorized_keys/,

  // Download and execute
  /curl\s+.*\|\s*bash/,
  /wget\s+.*\|\s*bash/,
  /curl\s+.*\|\s*sh/,
  /wget\s+.*\|\s*sh/,
];

/**
 * Check if a command contains dangerous patterns
 * @param {string} command - Command to check
 * @returns {Object} { safe: boolean, reason: string|null }
 */
export function isCommandSafe(command) {
  if (!command || typeof command !== 'string') {
    return { safe: false, reason: 'Invalid command format' };
  }

  // Normalize whitespace for pattern matching
  const normalizedCommand = command.trim().replace(/\s+/g, ' ');

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(normalizedCommand)) {
      const reason = `Command blocked: matches dangerous pattern ${pattern}`;
      logger.warn('Blocked dangerous command', { command, pattern: pattern.toString() });
      return { safe: false, reason };
    }
  }

  return { safe: true, reason: null };
}

/**
 * Validate and sanitize command arguments
 * @param {Array<string>} args - Command arguments
 * @returns {Object} { safe: boolean, reason: string|null, sanitized: Array<string> }
 */
export function sanitizeCommandArgs(args) {
  if (!Array.isArray(args)) {
    return { safe: false, reason: 'Arguments must be an array', sanitized: [] };
  }

  const sanitized = [];

  for (const arg of args) {
    if (typeof arg !== 'string') {
      return { safe: false, reason: 'All arguments must be strings', sanitized: [] };
    }

    // Check for shell injection attempts
    if (arg.includes(';') || arg.includes('|') || arg.includes('&')) {
      return { safe: false, reason: 'Arguments contain shell metacharacters', sanitized: [] };
    }

    // Check for command substitution
    if (arg.includes('`') || arg.includes('$(')) {
      return { safe: false, reason: 'Arguments contain command substitution', sanitized: [] };
    }

    sanitized.push(arg);
  }

  return { safe: true, reason: null, sanitized };
}

/**
 * Validate file path is within allowed boundaries
 * @param {string} filePath - File path to validate
 * @param {string} allowedRoot - Allowed root directory
 * @returns {boolean} True if path is safe
 */
export function isPathSafe(filePath, allowedRoot) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Prevent path traversal
  if (filePath.includes('..')) {
    logger.warn('Blocked path traversal attempt', { filePath });
    return false;
  }

  // Prevent absolute paths outside allowed root
  if (filePath.startsWith('/') && !filePath.startsWith(allowedRoot)) {
    logger.warn('Blocked absolute path outside root', { filePath, allowedRoot });
    return false;
  }

  return true;
}

/**
 * Validate npm/yarn command
 * @param {string} command - npm or yarn command
 * @returns {Object} { safe: boolean, reason: string|null }
 */
export function validatePackageManagerCommand(command) {
  const normalizedCommand = command.trim().toLowerCase();

  // Allow safe read-only commands
  const safeCommands = [
    'npm list',
    'npm ls',
    'npm view',
    'npm info',
    'npm search',
    'yarn list',
    'yarn info',
    'yarn why',
  ];

  for (const safe of safeCommands) {
    if (normalizedCommand.startsWith(safe)) {
      return { safe: true, reason: null };
    }
  }

  // Allow install/uninstall with warnings
  if (normalizedCommand.startsWith('npm install') ||
      normalizedCommand.startsWith('npm uninstall') ||
      normalizedCommand.startsWith('yarn add') ||
      normalizedCommand.startsWith('yarn remove')) {
    return { safe: true, reason: null };
  }

  // Block config changes
  if (normalizedCommand.includes('config')) {
    return { safe: false, reason: 'Package manager config changes are not allowed' };
  }

  // Block script execution (to prevent malicious package.json scripts)
  if (normalizedCommand.startsWith('npm run') || normalizedCommand.startsWith('yarn run')) {
    return { safe: false, reason: 'Script execution requires manual review' };
  }

  return { safe: true, reason: null };
}

export default {
  isCommandSafe,
  sanitizeCommandArgs,
  isPathSafe,
  validatePackageManagerCommand,
  DANGEROUS_PATTERNS
};
