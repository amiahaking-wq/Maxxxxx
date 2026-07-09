import { spawn } from 'child_process';
import { isCommandSafe, sanitizeCommandArgs } from './blocklist.js';
import logger from '../utils/logger.js';
import fs from 'fs';

const COMMAND_TIMEOUT = parseInt(process.env.COMMAND_TIMEOUT_MS || '300000', 10);
const SANDBOX_WORKSPACE = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

/**
 * Execute a command safely in a sandboxed environment
 * @param {string} command - Command to execute
 * @param {Array<string>} args - Command arguments
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result with stdout, stderr, exitCode
 */
export async function executeCommandSafely(command, args = [], options = {}) {
  // Validate command safety
  const fullCommand = `${command} ${args.join(' ')}`;
  const safetyCheck = isCommandSafe(fullCommand);

  if (!safetyCheck.safe) {
    logger.warn('Blocked unsafe command', { command, args, reason: safetyCheck.reason });
    throw new Error(`Command blocked: ${safetyCheck.reason}`);
  }

  // Sanitize arguments
  const argCheck = sanitizeCommandArgs(args);
  if (!argCheck.safe) {
    logger.warn('Blocked unsafe arguments', { command, args, reason: argCheck.reason });
    throw new Error(`Arguments blocked: ${argCheck.reason}`);
  }

  const sanitizedArgs = argCheck.sanitized;

  // Prepare execution options
  const execOptions = {
    cwd: options.cwd || SANDBOX_WORKSPACE,
    timeout: options.timeout || COMMAND_TIMEOUT,
    env: {
      ...process.env,
      ...options.env,
      // Ensure we don't leak sensitive env vars
      TELEGRAM_BOT_TOKEN: undefined,
      GROQ_API_KEY: undefined,
      GITHUB_TOKEN: undefined,
    },
  };

  return new Promise((resolve, reject) => {
    logger.info('Executing command', { command, args: sanitizedArgs, cwd: execOptions.cwd });

    const child = spawn(command, sanitizedArgs, execOptions);

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');

      // Force kill after 5 seconds if not terminated
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, execOptions.timeout);

    // Collect stdout
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Collect stderr
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process completion
    child.on('close', (exitCode) => {
      clearTimeout(timeoutId);

      const result = {
        stdout,
        stderr,
        exitCode,
        timedOut,
        command: fullCommand
      };

      if (timedOut) {
        logger.warn('Command timed out', { command, timeout: execOptions.timeout });
        reject(new Error(`Command timed out after ${execOptions.timeout}ms`));
      } else if (exitCode !== 0) {
        logger.warn('Command failed', { command, exitCode, stderr });
        resolve(result); // Don't reject, return the error for agent to handle
      } else {
        logger.info('Command completed successfully', { command, exitCode });
        resolve(result);
      }
    });

    // Handle process errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      logger.error('Command execution error', { command, error: error.message });
      reject(error);
    });
  });
}

/**
 * Execute git command safely
 * @param {Array<string>} args - Git command arguments
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
export async function executeGitCommand(args, options = {}) {
  // Git commands are generally safe, but validate anyway
  const allowedGitCommands = [
    'init', 'clone', 'add', 'commit', 'push', 'pull', 'fetch',
    'status', 'log', 'diff', 'branch', 'checkout', 'merge',
    'remote', 'tag', 'stash', 'show', 'ls-files'
  ];

  const gitCommand = args[0];
  if (!allowedGitCommands.includes(gitCommand)) {
    throw new Error(`Git command not allowed: ${gitCommand}`);
  }

  return executeCommandSafely('git', args, options);
}

/**
 * Execute npm command safely
 * @param {Array<string>} args - npm command arguments
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
export async function executeNpmCommand(args, options = {}) {
  const fullCommand = `npm ${args.join(' ')}`;
  const safetyCheck = isCommandSafe(fullCommand);

  if (!safetyCheck.safe) {
    throw new Error(`npm command blocked: ${safetyCheck.reason}`);
  }

  return executeCommandSafely('npm', args, options);
}

/**
 * Execute test command safely
 * @param {string} testCommand - Test command to run
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
export async function executeTestCommand(testCommand, options = {}) {
  // Common test commands
  const testCommands = {
    'npm test': ['npm', ['test']],
    'yarn test': ['yarn', ['test']],
    'npm run test': ['npm', ['run', 'test']],
    'pytest': ['pytest', []],
    'jest': ['jest', []],
    'mocha': ['mocha', []],
  };

  const [command, args] = testCommands[testCommand] || [testCommand, []];
  return executeCommandSafely(command, args, options);
}

/**
 * Validate execution environment
 * @returns {Object} Environment validation result
 */
export function validateEnvironment() {
  const errors = [];

  // Check if sandbox workspace exists
  try {
    if (!fs.existsSync(SANDBOX_WORKSPACE)) {
      // This is a warning, not a fatal error - workspace will be created
      logger.warn(`Sandbox workspace does not exist yet: ${SANDBOX_WORKSPACE} (will be created)`);
    }
  } catch (error) {
    errors.push(`Failed to check sandbox workspace: ${error.message}`);
  }

  // Check required environment variables (core requirements)
  const requiredVars = [
    'GROQ_API_KEY',
    'GITHUB_TOKEN',
    'GITHUB_OWNER',
    'GITHUB_REPO',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Check optional environment variables (Telegram bot)
  const optionalVars = [
    'TELEGRAM_BOT_TOKEN',
    'AUTHORIZED_USER_ID',
  ];

  const warnings = [];
  for (const varName of optionalVars) {
    if (!process.env[varName]) {
      warnings.push(`Optional environment variable not set: ${varName} (Telegram bot will be disabled)`);
    }
  }

  if (warnings.length > 0) {
    logger.warn('Optional features disabled', { warnings });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  executeCommandSafely,
  executeGitCommand,
  executeNpmCommand,
  executeTestCommand,
  validateEnvironment,
  COMMAND_TIMEOUT,
  SANDBOX_WORKSPACE
};
