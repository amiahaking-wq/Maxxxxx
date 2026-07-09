/**
 * Message history API routes
 */

import { Router } from 'express';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';
import { authenticate } from '../middleware/auth.js';

const db = getDatabase();

const router = Router();

/**
 * GET /api/messages/:sessionId
 * Get all messages for a session
 */
router.get('/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    // Verify session exists
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE session_id = ?
    `).get(sessionId);

    res.json({
      success: true,
      messages,
      pagination: {
        total: total.count,
        limit,
        offset,
        hasMore: offset + limit < total.count
      }
    });
  } catch (error) {
    logger.error('Failed to get messages', {
      sessionId: req.params.sessionId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /api/messages/:sessionId
 * Send a new message and trigger agent execution
 */
router.post('/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { content, role = 'user' } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Verify session exists
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Insert message
    db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(messageId, sessionId, role, content, now);

    // Update session last activity
    db.prepare(`
      UPDATE sessions SET last_activity = ? WHERE id = ?
    `).run(now, sessionId);

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);

    logger.info('Message created', { messageId, sessionId, role });

    res.status(201).json({
      success: true,
      message
    });

    // Trigger agent execution asynchronously if this is a user message
    if (role === 'user' && global.agentExecutor) {
      setImmediate(() => {
        global.agentExecutor(sessionId, content).catch(err => {
          logger.error('Agent execution failed', {
            sessionId,
            error: err.message
          });
        });
      });
    }
  } catch (error) {
    logger.error('Failed to create message', {
      sessionId: req.params.sessionId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to create message' });
  }
});

/**
 * GET /api/messages/:sessionId/:messageId
 * Get a specific message
 */
router.get('/:sessionId/:messageId', authenticate, async (req, res) => {
  try {
    const { sessionId, messageId } = req.params;

    const message = db.prepare(`
      SELECT * FROM messages
      WHERE id = ? AND session_id = ?
    `).get(messageId, sessionId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({
      success: true,
      message
    });
  } catch (error) {
    logger.error('Failed to get message', {
      messageId: req.params.messageId,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get message' });
  }
});

export default router;
