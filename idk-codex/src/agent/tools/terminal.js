/**
 * Agent Terminal - Persistent Shell Session
 *
 * Provides a persistent bash shell that maintains state across commands.
 * Uses child_process spawn instead of node-pty to avoid native compilation.
 *
 * Features:
 * - Persistent environment (cd, exports persist)
 * - Real-time output streaming
 * - Timeout support
 * - Concurrent command prevention
 * - Command completion detection
 */

import { spawn } from 'child_process';
import logger from '../../utils/logger.js';

/**
 * Agent Terminal class for managing persistent shell sessions
 */
class AgentTerminal {
  /**
   * Create a new agent terminal
   * @param {string} sessionId - Session identifier
   * @param {string} workspacePath - Workspace directory path
   * @param {Function} streamCallback - Callback for streaming output (event, data)
   */
  constructor(sessionId, workspacePath, streamCallback) {
    this.sessionId = sessionId;
    this.workspacePath = workspacePath;
    this.streamCallback = streamCallback;
    this.process = null;
    this.busy = false;
    this.outputBuffer = '';
    this.currentResolve = null;
    this.currentReject = null;
    this.commandTimeout = null;
    this.completionMarker = null;

    logger.info('Agent terminal created', { sessionId, workspacePath });
  }

  /**
   * Initialize the terminal session
   * @returns {Promise<void>}
   */
  async init() {
    try {
      logger.info('Initializing terminal session', { sessionId: this.sessionId });

      // Spawn bash shell in the workspace
      this.process = spawn('/bin/bash', [], {
        cwd: this.workspacePath,
        env: {
          ...process.env,
          PS1: '$ ',
          HOME: this.workspacePath,
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
        },
        shell: false
      });

      // Set up data handler for stdout
      this.process.stdout.on('data', (data) => {
        this.handleOutput(data.toString());
      });

      // Set up data handler for stderr
      this.process.stderr.on('data', (data) => {
        this.handleOutput(data.toString());
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        logger.warn('Terminal process exited', {
          sessionId: this.sessionId,
          code,
          signal
        });

        if (this.currentReject) {
          this.currentReject(new Error(`Terminal process exited with code ${code}`));
          this.currentReject = null;
          this.currentResolve = null;
        }
      });

      // Handle process errors
      this.process.on('error', (error) => {
        logger.error('Terminal process error', {
          sessionId: this.sessionId,
          error: error.message
        });

        if (this.currentReject) {
          this.currentReject(error);
          this.currentReject = null;
          this.currentResolve = null;
        }
      });

      // Set custom prompt for command completion detection
      await this.execInit('export PS1="$ "');
      await this.execInit('export TERM=dumb');

      logger.info('Terminal session initialized', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('Failed to initialize terminal', {
        sessionId: this.sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute initialization command without waiting for prompt
   * @param {string} command - Command to execute
   * @returns {Promise<void>}
   */
  async execInit(command) {
    return new Promise((resolve) => {
      this.process.stdin.write(command + '\n');
      setTimeout(resolve, 100);
    });
  }

  /**
   * Handle output from the shell
   * @param {string} data - Output data
   */
  handleOutput(data) {
    this.outputBuffer += data;

    // Capture exit code if present
    if (this.exitRegex) {
      const match = this.outputBuffer.match(this.exitRegex);
      if (match) {
        this.commandExitCode = parseInt(match[1], 10);
      }
    }

    // Stream output to callback, stripping internal markers
    if (this.streamCallback) {
      try {
        let displayData = data;
        if (this.exitRegex) {
          displayData = displayData.replace(new RegExp(this.exitRegex.source, 'g'), '');
        }
        if (this.completionMarker) {
          displayData = displayData.split(this.completionMarker).join('');
        }

        if (displayData) {
          this.streamCallback('terminal:output', { output: displayData });
        }
      } catch (error) {
        logger.warn('Stream callback failed', { error: error.message });
      }
    }

    // Check for command completion using marker
    if (this.currentResolve && this.completionMarker) {
      if (this.outputBuffer.includes(this.completionMarker)) {
        clearTimeout(this.commandTimeout);

        // Remove exit code and completion markers from output
        let output = this.outputBuffer
          .replace(this.exitRegex, '')
          .split(this.completionMarker)
          .join('')
          .trim();

        // Remove any trailing prompt
        output = output.replace(/\$\s*$/g, '').trim();

        this.currentResolve({ output, exitCode: this.commandExitCode ?? 0 });
        this.currentResolve = null;
        this.currentReject = null;
        this.completionMarker = null;
        this.exitRegex = null;
        this.commandExitCode = null;
        this.busy = false;
      }
    }
  }

  /**
   * Execute a command in the terminal
   * @param {string} command - Command to execute
   * @param {number} timeoutMs - Command timeout in milliseconds
   * @returns {Promise<Object>} Command result {output, exitCode}
   */
  async exec(command, timeoutMs = 30000) {
    if (this.busy) {
      throw new Error('Terminal is busy executing another command');
    }

    if (!this.process || this.process.exitCode !== null) {
      throw new Error('Terminal process is not running');
    }

    try {
      this.busy = true;
      this.outputBuffer = '';
      this.commandExitCode = null;

      logger.info('Executing terminal command', {
        sessionId: this.sessionId,
        command: command.substring(0, 100),
        timeout: timeoutMs
      });

      // Stream command being executed
      if (this.streamCallback) {
        try {
          this.streamCallback('terminal:command', { command });
        } catch (error) {
          logger.warn('Stream callback failed', { error: error.message });
        }
      }

      // Use a unique marker to detect command completion
      const timestamp = Date.now();
      const marker = `__CMD_DONE_${timestamp}__`;
      const exitPattern = `__CMD_EXIT_${timestamp}_(\\d+)__`;
      this.exitRegex = new RegExp(exitPattern);
      this.completionMarker = marker;

      return await new Promise((resolve, reject) => {
        this.currentResolve = resolve;
        this.currentReject = reject;

        // Set timeout
        this.commandTimeout = setTimeout(() => {
          this.busy = false;
          this.currentResolve = null;
          this.currentReject = null;
          this.completionMarker = null;
          this.exitRegex = null;
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        // Write command with completion marker
        // Capture exit code and emit completion marker in a single bash line
        const statusVar = `__CMD_STATUS_${timestamp}`;
        const wrapped = '{ ' + command + '; }; ' + statusVar + '=$?; echo "__CMD_EXIT_' + timestamp + '_${' + statusVar + '}__"; echo "' + marker + '"';
        try {
          this.process.stdin.write(wrapped + '\n');
        } catch (error) {
          clearTimeout(this.commandTimeout);
          this.busy = false;
          this.currentResolve = null;
          this.currentReject = null;
          this.completionMarker = null;
          this.exitRegex = null;
          reject(error);
        }
      });
    } catch (error) {
      this.busy = false;
      logger.error('Command execution failed', {
        sessionId: this.sessionId,
        command: command.substring(0, 100),
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Kill the terminal process
   * @returns {Promise<void>}
   */
  async kill() {
    try {
      logger.info('Killing terminal process', { sessionId: this.sessionId });

      if (this.commandTimeout) {
        clearTimeout(this.commandTimeout);
      }

      if (this.process && this.process.exitCode === null) {
        this.process.kill('SIGTERM');

        // Wait for process to exit or force kill after 2s
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            if (this.process && this.process.exitCode === null) {
              this.process.kill('SIGKILL');
            }
            resolve();
          }, 2000);

          this.process.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      this.process = null;
      this.busy = false;
      this.currentResolve = null;
      this.currentReject = null;

      logger.info('Terminal process killed', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('Failed to kill terminal process', {
        sessionId: this.sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if terminal is busy
   * @returns {boolean} True if busy
   */
  isBusy() {
    return this.busy;
  }

  /**
   * Get current working directory
   * @returns {Promise<string>} Current working directory
   */
  async getCwd() {
    try {
      const result = await this.exec('pwd', 5000);
      return result.output.trim().replace(/\$\s*$/, '').trim();
    } catch (error) {
      logger.warn('Failed to get cwd', { error: error.message });
      return this.workspacePath;
    }
  }
}

export default AgentTerminal;
