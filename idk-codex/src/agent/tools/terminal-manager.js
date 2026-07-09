/**
 * Terminal Manager - Manages persistent AgentTerminal sessions per sessionId
 * and exposes Socket.IO event handlers for interactive terminal use.
 */

import AgentTerminal from './terminal.js';
import { broadcastTerminalOutput, broadcastTerminalCommand } from '../../api/websocket.js';
import logger from '../../utils/logger.js';

class TerminalManager {
  constructor() {
    this.terminals = new Map();
  }

  /**
   * Get or create an AgentTerminal for a session
   * @param {string} sessionId - Session identifier
   * @param {string} workspacePath - Workspace directory
   * @returns {AgentTerminal}
   */
  getTerminal(sessionId, workspacePath) {
    if (!this.terminals.has(sessionId)) {
      const workspace = workspacePath || process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
      const terminal = new AgentTerminal(sessionId, workspace, (event, data) => {
        if (event === 'terminal:output') {
          broadcastTerminalOutput(sessionId, data.output);
        } else if (event === 'terminal:command') {
          broadcastTerminalCommand(sessionId, data.command);
        }
      });

      terminal.init().catch(error => {
        logger.error('Failed to initialize terminal', { sessionId, error: error.message });
      });

      this.terminals.set(sessionId, terminal);
      logger.info('Created terminal session', { sessionId, workspace });
    }

    return this.terminals.get(sessionId);
  }

  /**
   * Execute a command in a session's terminal
   * @param {string} sessionId - Session identifier
   * @param {string} command - Command to execute
   * @param {Object} options - Options {workspacePath, timeoutMs}
   * @returns {Promise<Object>} {output, exitCode}
   */
  async exec(sessionId, command, options = {}) {
    const terminal = this.getTerminal(sessionId, options.workspacePath);

    if (terminal.isBusy()) {
      throw new Error('Terminal is busy');
    }

    return await terminal.exec(command, options.timeoutMs || 30000);
  }

  /**
   * Execute a command and broadcast streamed output directly
   * @param {string} sessionId - Session identifier
   * @param {string} command - Command to execute
   * @param {Object} options - Options {workspacePath, timeoutMs}
   * @returns {Promise<Object>}
   */
  async execWithBroadcast(sessionId, command, options = {}) {
    broadcastTerminalCommand(sessionId, command);
    const result = await this.exec(sessionId, command, options);
    broadcastTerminalOutput(sessionId, result.output);
    return result;
  }

  /**
   * Kill a terminal session
   * @param {string} sessionId - Session identifier
   */
  async kill(sessionId) {
    const terminal = this.terminals.get(sessionId);
    if (terminal) {
      await terminal.kill();
      this.terminals.delete(sessionId);
      logger.info('Terminal session killed', { sessionId });
    }
  }

  /**
   * Check if a terminal session exists
   * @param {string} sessionId
   * @returns {boolean}
   */
  has(sessionId) {
    return this.terminals.has(sessionId);
  }
}

const terminalManager = new TerminalManager();
export default terminalManager;
