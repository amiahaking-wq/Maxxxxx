/**
 * Simple authentication middleware
 * Uses environment variable for token validation
 */

import logger from '../../utils/logger.js';

/**
 * Authenticates API requests using bearer token
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Allow requests without auth in development
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    // Allow web UI requests (no auth required for web interface)
    // The web UI connects via WebSocket from same origin
    if (process.env.DISABLE_WEB_UI_AUTH === 'true') {
      return next();
    }

    // Check for authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('API request without authorization header', {
        path: req.path,
        ip: req.ip
      });
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const validToken = process.env.WEB_UI_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

    if (token !== validToken) {
      logger.warn('API request with invalid token', {
        path: req.path,
        ip: req.ip
      });
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Optional authentication - allows requests to proceed even if not authenticated
 * Adds req.authenticated flag for conditional logic
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 */
export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const validToken = process.env.WEB_UI_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
      req.authenticated = token === validToken;
    } else {
      req.authenticated = false;
    }

    next();
  } catch (error) {
    logger.error('Optional auth error', { error: error.message });
    req.authenticated = false;
    next();
  }
}
