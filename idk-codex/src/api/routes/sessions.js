/**
 * Sessions API Routes
 * Handles session management, message retrieval, and archiving
 */

import express from 'express';
import logger from '../../utils/logger.js';
import { getDatabase } from '../../database/db.js';

const router = express.Router();

/**
 * GET /api/sessions
 * List all sessions for a user with optional filtering
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 20, platform, userId } = req.query;

    logger.info('API', {
      method: 'GET',
      path: '/api/sessions',
      query: req.query
    });

    // Get user ID from session or query
    const requestUserId = userId || req.session?.userId || 'default-user';

    const db = getDatabase();

    let query = `
      SELECT
        s.id,
        s.created_at as createdAt,
        s.platform,
        COUNT(DISTINCT m.id) as messageCount,
        MAX(m.timestamp) as lastMessage,
        sc.repo_name as repoName
      FROM sessions s
      LEFT JOIN messages m ON s.id = m.session_id
      LEFT JOIN session_context sc ON s.id = sc.session_id
      WHERE s.user_id = ?
    `;

    const params = [requestUserId];

    if (platform) {
      query += ' AND s.platform = ?';
      params.push(platform);
    }

    query += `
      GROUP BY s.id
      ORDER BY MAX(m.timestamp) DESC, s.created_at DESC
      LIMIT ?
    `;
    params.push(parseInt(limit));

    const sessions = db.prepare(query).all(...params);

    // Format response
    const formattedSessions = sessions.map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      status: 'idle', // Default status
      messageCount: session.messageCount || 0,
      lastMessage: session.lastMessage || null,
      repoName: session.repoName || null,
      platform: session.platform || 'web'
    }));

    logger.info('API', {
      method: 'GET',
      path: '/api/sessions',
      status: 200,
      count: formattedSessions.length
    });

    res.json(formattedSessions);

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'GET',
      path: '/api/sessions',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to retrieve sessions',
      code: 'SESSION_FETCH_ERROR'
    });
  }
});

/**
 * GET /api/sessions/:id/messages
 * Get all messages for a specific session
 */
router.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    logger.info('API', {
      method: 'GET',
      path: `/api/sessions/${id}/messages`,
      query: req.query
    });

    const db = getDatabase();

    // Verify session exists
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

    if (!session) {
      logger.info('API', {
        method: 'GET',
        path: `/api/sessions/${id}/messages`,
        status: 404
      });

      return res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Get messages
    const messages = db.prepare(`
      SELECT id, role, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(id, parseInt(limit), parseInt(offset));

    logger.info('API', {
      method: 'GET',
      path: `/api/sessions/${id}/messages`,
      status: 200,
      count: messages.length
    });

    res.json(messages);

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'GET',
      path: `/api/sessions/${req.params.id}/messages`,
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to retrieve messages',
      code: 'MESSAGE_FETCH_ERROR'
    });
  }
});

/**
 * POST /api/sessions
 * Create a new session
 */
router.post('/', async (req, res) => {
  try {
    const { platform = 'web', userId } = req.body;

    logger.info('API', {
      method: 'POST',
      path: '/api/sessions',
      body: req.body
    });

    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        code: 'MISSING_USER_ID'
      });
    }

    const db = getDatabase();
    const sessionId = `${platform}_${Date.now()}_${userId}`;
    const now = new Date().toISOString();

    // Create session
    db.prepare(`
      INSERT INTO sessions (id, user_id, platform, created_at, last_activity)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, userId, platform, now, now);

    logger.info('API', {
      method: 'POST',
      path: '/api/sessions',
      status: 201,
      sessionId: sessionId
    });

    res.status(201).json({
      sessionId: sessionId,
      created: true
    });

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'POST',
      path: '/api/sessions',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to create session',
      code: 'SESSION_CREATE_ERROR'
    });
  }
});

/**
 * DELETE /api/sessions/:id
 * Archive a session
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    logger.info('API', {
      method: 'DELETE',
      path: `/api/sessions/${id}`
    });

    const db = getDatabase();

    // Verify session exists
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

    if (!session) {
      logger.info('API', {
        method: 'DELETE',
        path: `/api/sessions/${id}`,
        status: 404
      });

      return res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Archive session (mark as archived instead of deleting)
    db.prepare(`
      UPDATE sessions
      SET last_activity = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);

    logger.info('API', {
      method: 'DELETE',
      path: `/api/sessions/${id}`,
      status: 200
    });

    res.json({
      archived: true,
      sessionId: id
    });

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'DELETE',
      path: `/api/sessions/${req.params.id}`,
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to archive session',
      code: 'SESSION_ARCHIVE_ERROR'
    });
  }
});

export default router;
