import winston from 'winston';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = join(process.cwd(), 'logs');
try {
  mkdirSync(logsDir, { recursive: true });
} catch (error) {
  // Directory already exists or can't be created
}

/**
 * Custom log format for better readability
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}${metaStr}`;
  })
);

/**
 * Console format with colors for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0 && meta.error) {
      metaStr = `\n${JSON.stringify(meta, null, 2)}`;
    } else if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} ${level}: ${message}${metaStr}`;
  })
);

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport for all environments
    new winston.transports.Console({
      format: consoleFormat
    }),
    // File transport for errors
    new winston.transports.File({
      filename: join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: join(logsDir, 'exceptions.log')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: join(logsDir, 'rejections.log')
    })
  ]
});

/**
 * Log agent phase transition
 * @param {string} phase - Agent phase name
 * @param {string} status - Phase status
 * @param {Object} metadata - Additional metadata
 */
logger.logPhase = function(phase, status, metadata = {}) {
  this.info(`Agent phase: ${phase}`, { phase, status, ...metadata });
};

/**
 * Log command execution
 * @param {string} command - Command being executed
 * @param {Object} result - Command execution result
 */
logger.logCommand = function(command, result) {
  if (result.exitCode === 0) {
    this.info(`Command succeeded: ${command}`, { command, exitCode: result.exitCode });
  } else {
    this.warn(`Command failed: ${command}`, {
      command,
      exitCode: result.exitCode,
      stderr: result.stderr?.substring(0, 500)
    });
  }
};

/**
 * Log GitHub API call
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} result - API result
 */
logger.logGitHubAPI = function(endpoint, method, result) {
  this.info(`GitHub API: ${method} ${endpoint}`, {
    endpoint,
    method,
    status: result.status
  });
};

/**
 * Log Groq API call
 * @param {string} model - Model used
 * @param {number} tokens - Tokens used
 */
logger.logGroqAPI = function(model, tokens) {
  this.info(`Groq API call`, { model, tokens });
};

/**
 * Log Telegram message
 * @param {string} type - Message type (incoming/outgoing)
 * @param {number} userId - User ID
 * @param {string} messagePreview - Preview of message
 */
logger.logTelegram = function(type, userId, messagePreview) {
  this.info(`Telegram ${type}`, {
    type,
    userId,
    preview: messagePreview?.substring(0, 100)
  });
};

/**
 * V2 Enhancement: Log audit event for security tracking
 * @param {number} userId - User ID
 * @param {number|null} sessionId - Session ID (optional)
 * @param {string} eventType - Event type
 * @param {string} action - Action description
 * @param {Object|null} details - Additional details
 * @param {string} riskLevel - Risk level: 'low', 'medium', 'high', 'critical'
 */
logger.audit = async function(userId, sessionId, eventType, action, details = null, riskLevel = 'low') {
  // Log to Winston first
  const logLevel = riskLevel === 'critical' || riskLevel === 'high' ? 'warn' : 'info';
  this[logLevel](`Audit: ${eventType}`, {
    userId,
    sessionId,
    action,
    riskLevel,
    details
  });

  // Write to database (async, but don't await to avoid blocking)
  try {
    // Dynamic import to avoid circular dependency
    const { logAuditEvent } = await import('../database/queries.js');
    logAuditEvent(userId, sessionId, eventType, action, details, riskLevel);
  } catch (error) {
    this.error('Failed to write audit log to database', { error: error.message });
  }
};

export default logger;
