/**
 * Request Normalizer
 * Normalizes requests from different entry points (Telegram, Socket.IO, CLI)
 * into a unified format for agent processing
 *
 * Handles:
 *   - Telegram ctx objects
 *   - Socket.IO message objects
 *   - CLI argv arrays
 *   - HTTP API request bodies
 */

import { getOrCreateSession } from '../database/queries.js';
import logger from '../utils/logger.js';

/**
 * Normalize Telegram request
 * @param {Object} ctx - Telegraf context object
 * @returns {Object} Normalized request
 */
function normalizeTelegramRequest(ctx) {
  const userId = String(ctx.from.id);
  const platform = 'telegram';
  const task = ctx.message?.text || '';
  const timestamp = new Date(ctx.message.date * 1000).toISOString();

  const sessionId = getOrCreateSession(userId, platform);

  return {
    sessionId,
    userId,
    platform,
    task,
    attachments: [],
    timestamp,
    metadata: {
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      lastName: ctx.from.last_name,
      chatId: ctx.chat.id,
      messageId: ctx.message.message_id
    }
  };
}

/**
 * Normalize Socket.IO request
 * @param {Object} message - Socket.IO message object
 * @param {Object} socket - Socket instance
 * @returns {Object} Normalized request
 */
function normalizeSocketIORequest(message, socket) {
  const userId = String(message.userId || socket.handshake.auth?.userId || 'socket_user');
  const platform = message.platform || 'web';
  const task = message.task || message.message || '';
  const timestamp = message.timestamp || new Date().toISOString();

  const sessionId = message.sessionId || getOrCreateSession(userId, platform);

  return {
    sessionId,
    userId,
    platform,
    task,
    attachments: message.attachments || [],
    timestamp,
    metadata: {
      socketId: socket.id,
      handshake: {
        query: socket.handshake.query,
        headers: {
          userAgent: socket.handshake.headers['user-agent'],
          origin: socket.handshake.headers.origin
        }
      }
    }
  };
}

/**
 * Normalize CLI request
 * @param {Array} argv - Command line arguments
 * @param {Object} options - Additional options
 * @returns {Object} Normalized request
 */
function normalizeCLIRequest(argv, options = {}) {
  const userId = String(options.userId || process.env.USER || 'cli_user');
  const platform = 'cli';
  const task = argv.join(' ');
  const timestamp = new Date().toISOString();

  const sessionId = options.sessionId || getOrCreateSession(userId, platform);

  return {
    sessionId,
    userId,
    platform,
    task,
    attachments: [],
    timestamp,
    metadata: {
      cwd: process.cwd(),
      argv: argv,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PWD: process.env.PWD
      }
    }
  };
}

/**
 * Normalize HTTP API request
 * @param {Object} req - Express request object
 * @returns {Object} Normalized request
 */
function normalizeAPIRequest(req) {
  const body = req.body || {};
  const userId = String(body.userId || req.user?.id || 'api_user');
  const platform = body.platform || 'api';
  const task = body.task || '';
  const timestamp = body.timestamp || new Date().toISOString();

  const sessionId = body.sessionId || getOrCreateSession(userId, platform);

  return {
    sessionId,
    userId,
    platform,
    task,
    attachments: body.attachments || [],
    timestamp,
    metadata: {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      method: req.method,
      path: req.path,
      headers: {
        contentType: req.get('content-type'),
        accept: req.get('accept')
      }
    }
  };
}

/**
 * Auto-detect platform and normalize request
 * @param {*} rawInput - Raw input from any platform
 * @param {Object} context - Additional context (socket, req, etc.)
 * @returns {Object} Normalized request
 */
export function normalizeRequest(rawInput, context = {}) {
  try {
    // Detect platform based on input shape
    if (rawInput?.from && rawInput?.message) {
      // Telegram context
      logger.debug('Normalizing Telegram request');
      return normalizeTelegramRequest(rawInput);
    }

    if (rawInput?.task && context?.socket) {
      // Socket.IO message
      logger.debug('Normalizing Socket.IO request');
      return normalizeSocketIORequest(rawInput, context.socket);
    }

    if (Array.isArray(rawInput)) {
      // CLI arguments
      logger.debug('Normalizing CLI request');
      return normalizeCLIRequest(rawInput, context);
    }

    if (rawInput?.body && rawInput?.method) {
      // Express request
      logger.debug('Normalizing API request');
      return normalizeAPIRequest(rawInput);
    }

    // Default/generic normalization
    logger.warn('Unknown input format, using generic normalization');
    const userId = String(context.userId || 'unknown_user');
    const platform = context.platform || 'unknown';
    const sessionId = context.sessionId || getOrCreateSession(userId, platform);

    return {
      sessionId,
      userId,
      platform,
      task: String(rawInput),
      attachments: [],
      timestamp: new Date().toISOString(),
      metadata: context
    };

  } catch (error) {
    logger.error('Request normalization failed', {
      error: error.message,
      rawInput: JSON.stringify(rawInput).substring(0, 200)
    });
    throw new Error(`Failed to normalize request: ${error.message}`);
  }
}

/**
 * Validate normalized request
 * @param {Object} normalized - Normalized request object
 * @returns {Object} {valid: boolean, errors: string[]}
 */
export function validateNormalizedRequest(normalized) {
  const errors = [];

  if (!normalized.sessionId) {
    errors.push('sessionId is required');
  }

  if (!normalized.userId) {
    errors.push('userId is required');
  }

  if (!normalized.platform) {
    errors.push('platform is required');
  }

  if (!normalized.task || typeof normalized.task !== 'string') {
    errors.push('task must be a non-empty string');
  }

  if (normalized.task && normalized.task.trim().length === 0) {
    errors.push('task cannot be empty or whitespace');
  }

  if (normalized.task && normalized.task.length > 10000) {
    errors.push('task exceeds maximum length of 10000 characters');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extract task description from various input formats
 * @param {*} input - Raw input
 * @returns {string} Task description
 */
export function extractTask(input) {
  if (typeof input === 'string') {
    return input.trim();
  }

  if (input?.message?.text) {
    // Telegram
    return input.message.text.trim();
  }

  if (input?.task) {
    // Socket.IO or API
    return input.task.trim();
  }

  if (Array.isArray(input)) {
    // CLI
    return input.join(' ').trim();
  }

  if (input?.body?.task) {
    // Express request
    return input.body.task.trim();
  }

  return '';
}

export default {
  normalizeRequest,
  validateNormalizedRequest,
  extractTask
};
