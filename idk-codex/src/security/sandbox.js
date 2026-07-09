import { spawn } from 'child_process';
import { isCommandSafe, sanitizeCommandArgs } from './blocklist.js';
import { broadcastTerminalOutput, broadcastTerminalCommand } from '../api/websocket.js';
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
  const fullCommand = [command, ...args].join(' ');
  const sessionId = options.sessionId || null;
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
      ANTHROPIC_API_KEY: undefined,
      GOOGLE_GEMINI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      OPENAI_COMPATIBLE_API_KEY: undefined,
      LOCAL_API_KEY: undefined,
      PHONE_SECRET: undefined,
      GITHUB_TOKEN: undefined,
    },
  };

  if (sessionId) {
    broadcastTerminalCommand(sessionId, fullCommand);
  }

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

    // Collect stdout and broadcast to session terminal if sessionId is set
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (sessionId) {
        broadcastTerminalOutput(sessionId, chunk);
      }
    });

    // Collect stderr and broadcast to session terminal if sessionId is set
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (sessionId) {
        broadcastTerminalOutput(sessionId, chunk);
      }
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
 *
 * The only hard fatal condition is a missing sandbox workspace directory
 * that we cannot create. Everything else (LLM providers, Telegram bot, etc.)
 * is a warning — the server boots and the user can configure providers later
 * via the .env file or the web UI.
 *
 * This lets the user start MAX, test the Telegram bot, and add an LLM key
 * (Groq/Gemini/etc.) afterwards without having to restart in a particular
 * order.
 *
 * @returns {Object} Environment validation result
 */
export function validateEnvironment() {
  const errors = [];
  const warnings = [];

  // Check if sandbox workspace exists
  try {
    if (!fs.existsSync(SANDBOX_WORKSPACE)) {
      // This is a warning, not a fatal error - workspace will be created
      logger.warn(`Sandbox workspace does not exist yet: ${SANDBOX_WORKSPACE} (will be created)`);
    }
  } catch (error) {
    errors.push(`Failed to check sandbox workspace: ${error.message}`);
  }

  // Check that at least one LLM provider is configured.
  // This is a WARNING, not a fatal error — the server still boots so the user
  // can interact with the Telegram bot and the web UI before adding an LLM key.
  // When the user actually sends a /task, the agent loop will return a clear
  // "All LLM providers failed" error if no provider is configured.
  const hasProvider = !!(
    process.env.GROQ_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_COMPATIBLE_BASE_URL ||
    process.env.OLLAMA_HOST ||
    process.env.LOCAL_API_BASE_URL ||
    process.env.PHONE_SECRET ||
    process.env.ECHO_PROVIDER_ENABLED === 'true'
  );

  if (!hasProvider) {
    warnings.push(
      'No LLM provider configured. The server will start, but task execution will fail until you set at least one of: ' +
      'GROQ_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GEMINI_API_KEY, OPENAI_API_KEY, ' +
      'OPENAI_COMPATIBLE_BASE_URL, OLLAMA_HOST, LOCAL_API_BASE_URL, or PHONE_SECRET. ' +
      'Free options: Groq (https://console.groq.com/keys) or Google Gemini (https://aistudio.google.com/app/apikey).'
    );
  }

  // Check optional environment variables (Telegram bot)
  const optionalVars = [
    'TELEGRAM_BOT_TOKEN',
    'AUTHORIZED_USER_ID',
  ];

  for (const varName of optionalVars) {
    if (!process.env[varName]) {
      warnings.push(`Optional environment variable not set: ${varName} (Telegram bot will be disabled)`);
    }
  }

  if (warnings.length > 0) {
    logger.warn('Environment warnings (non-fatal)', { warnings });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
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
