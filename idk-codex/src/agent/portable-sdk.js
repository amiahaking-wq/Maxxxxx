/**
 * Portable SDK for Claude Code
 *
 * Provides a clean, portable API for interacting with the agent system.
 * Inspired by Claude Code's SDK architecture.
 *
 * Usage:
 *   import { portable } from './agent/portable-sdk.js';
 *
 *   // List chats
 *   const chats = await portable.chat.list({ limit: 10 });
 *
 *   // Get messages
 *   const messages = await portable.chat.getMessages(chatId);
 *
 *   // Send message
 *   await portable.chat.send(chatId, 'Hello!');
 *
 * Based on Claude Code's portable SDK implementation
 */

import {
  createSession,
  getActiveSession,
  closeSession,
  addMessage,
  getRecentMessages,
  createAgentRun,
  getAgentRuns,
  logAuditEvent,
  getAuditHistory
} from '../database/queries.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Chat operations
 */
class ChatOperations {
  /**
   * List chat sessions
   *
   * @param {Object} options - List options
   * @param {number} options.limit - Maximum number of chats to return
   * @param {string} options.status - Filter by status (active, inactive)
   * @returns {Promise<Array>} Array of chat sessions
   */
  async list({ limit = 50, status = 'active' } = {}) {
    try {
      // This would need a new database query function
      // For now, return empty array
      logger.info('Listing chat sessions', { limit, status });
      return [];
    } catch (error) {
      logger.error('Failed to list chats', { error: error.message });
      throw error;
    }
  }

  /**
   * Get a specific chat session
   *
   * @param {number} chatId - Chat ID
   * @returns {Promise<Object|null>} Chat session or null
   */
  async get(chatId) {
    try {
      // Use existing getActiveSession - needs userId, not chatId
      // This is a limitation of current schema
      logger.info('Getting chat session', { chatId });
      return null;
    } catch (error) {
      logger.error('Failed to get chat', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Create a new chat session
   *
   * @param {Object} options - Chat creation options
   * @param {number} options.userId - User ID
   * @param {string} options.owner - Repository owner
   * @param {string} options.repo - Repository name
   * @param {string} options.message - Initial message
   * @param {string} options.title - Chat title
   * @returns {Promise<number>} New chat ID
   */
  async create({ userId, owner, repo, message, title } = {}) {
    try {
      logger.info('Creating chat session', { userId, title });

      const sessionId = createSession(userId);

      if (message) {
        addMessage(sessionId, 'user', message);
      }

      return sessionId;
    } catch (error) {
      logger.error('Failed to create chat', { error: error.message });
      throw error;
    }
  }

  /**
   * Get messages for a chat
   *
   * @param {number} chatId - Chat ID
   * @param {Object} options - Retrieval options
   * @param {number} options.limit - Maximum number of messages
   * @param {number} options.offset - Offset for pagination
   * @returns {Promise<Array>} Array of messages
   */
  async getMessages(chatId, { limit = 50, offset = 0 } = {}) {
    try {
      logger.info('Getting chat messages', { chatId, limit, offset });

      const messages = getRecentMessages(chatId, limit);

      // Apply offset if needed
      if (offset > 0) {
        return messages.slice(offset);
      }

      return messages;
    } catch (error) {
      logger.error('Failed to get messages', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Send a message to a chat
   *
   * @param {number} chatId - Chat ID
   * @param {string} message - Message content
   * @param {string} role - Message role (user, assistant, system)
   * @returns {Promise<number>} Message ID
   */
  async send(chatId, message, role = 'user') {
    try {
      logger.info('Sending message', { chatId, role });

      const messageId = addMessage(chatId, role, message);

      return messageId;
    } catch (error) {
      logger.error('Failed to send message', { error: error.message, chatId });
      throw error;
    }
  }

  /**
   * Close a chat session
   *
   * @param {number} chatId - Chat ID
   * @returns {Promise<void>}
   */
  async close(chatId) {
    try {
      logger.info('Closing chat session', { chatId });

      closeSession(chatId);
    } catch (error) {
      logger.error('Failed to close chat', { error: error.message, chatId });
      throw error;
    }
  }
}

/**
 * Project operations
 */
class ProjectOperations {
  /**
   * Get project information
   *
   * @param {string} workingDir - Working directory
   * @returns {Promise<Object>} Project information
   */
  async getInfo(workingDir = process.cwd()) {
    try {
      logger.info('Getting project info', { workingDir });

      const info = {
        workingDir,
        type: 'unknown',
        name: path.basename(workingDir),
        hasPackageJson: false,
        hasDocker: false,
        hasTests: false
      };

      // Check for package.json
      const packagePath = path.join(workingDir, 'package.json');
      if (fs.existsSync(packagePath)) {
        info.hasPackageJson = true;
        info.type = 'nodejs';

        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        info.name = pkg.name || info.name;
        info.version = pkg.version;
        info.dependencies = Object.keys(pkg.dependencies || {});
        info.hasTests = !!pkg.scripts?.test;
      }

      // Check for Dockerfile
      info.hasDocker = fs.existsSync(path.join(workingDir, 'Dockerfile'));

      return info;
    } catch (error) {
      logger.error('Failed to get project info', { error: error.message });
      throw error;
    }
  }

  /**
   * List project files
   *
   * @param {string} workingDir - Working directory
   * @param {Object} options - List options
   * @returns {Promise<Array<string>>} Array of file paths
   */
  async listFiles(workingDir = process.cwd(), { pattern = '*' } = {}) {
    try {
      logger.info('Listing project files', { workingDir, pattern });

      // Simple file listing - in production would use glob
      const files = [];

      function scanDir(dir, baseDir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(baseDir, fullPath);

          // Skip node_modules and .git
          if (entry.name === 'node_modules' || entry.name === '.git') {
            continue;
          }

          if (entry.isDirectory()) {
            scanDir(fullPath, baseDir);
          } else {
            files.push(relativePath);
          }
        }
      }

      scanDir(workingDir, workingDir);

      return files;
    } catch (error) {
      logger.error('Failed to list files', { error: error.message });
      throw error;
    }
  }
}

/**
 * Runtime operations
 */
class RuntimeOperations {
  /**
   * Get runtime information
   *
   * @returns {Object} Runtime information
   */
  getInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }

  /**
   * Get environment variables (safe subset)
   *
   * @returns {Object} Environment variables
   */
  getEnv() {
    const safeEnv = {};
    const allowedKeys = [
      'NODE_ENV',
      'PORT',
      'ENABLE_SOP',
      'MAX_RETRY_COUNT'
    ];

    for (const key of allowedKeys) {
      if (process.env[key]) {
        safeEnv[key] = process.env[key];
      }
    }

    return safeEnv;
  }
}

/**
 * User operations
 */
class UserOperations {
  /**
   * Get user information
   *
   * @param {number} userId - User ID
   * @returns {Promise<Object>} User information
   */
  async getInfo(userId) {
    try {
      logger.info('Getting user info', { userId });

      // This would need user table in database
      return {
        userId,
        // Placeholder data
      };
    } catch (error) {
      logger.error('Failed to get user info', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user's active session
   *
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} Active session or null
   */
  async getActiveSession(userId) {
    try {
      return getActiveSession(userId);
    } catch (error) {
      logger.error('Failed to get active session', { error: error.message });
      throw error;
    }
  }
}

/**
 * Context operations
 */
class ContextOperations {
  /**
   * Get agent runs for a session
   *
   * @param {number} sessionId - Session ID
   * @param {string} phase - Filter by phase (optional)
   * @returns {Promise<Array>} Array of agent runs
   */
  async getAgentRuns(sessionId, phase = null) {
    try {
      return getAgentRuns(sessionId, phase);
    } catch (error) {
      logger.error('Failed to get agent runs', { error: error.message });
      throw error;
    }
  }

  /**
   * Get audit history
   *
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of audit logs
   */
  async getAuditHistory(filters = {}) {
    try {
      return getAuditHistory(filters);
    } catch (error) {
      logger.error('Failed to get audit history', { error: error.message });
      throw error;
    }
  }
}

/**
 * Portable SDK main class
 */
export class PortableSDK {
  constructor() {
    this.chat = new ChatOperations();
    this.projects = new ProjectOperations();
    this.runtime = new RuntimeOperations();
    this.user = new UserOperations();
    this.context = new ContextOperations();
  }

  /**
   * Get SDK version
   *
   * @returns {string} SDK version
   */
  getVersion() {
    return '1.0.0';
  }

  /**
   * Health check
   *
   * @returns {Object} Health status
   */
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: this.getVersion()
    };
  }
}

// Export global instance
export const portable = new PortableSDK();

// Export individual operation classes for direct use
export {
  ChatOperations,
  ProjectOperations,
  RuntimeOperations,
  UserOperations,
  ContextOperations
};
