/**
 * Conversations API Routes
 * REST endpoints for chat history management
 *
 * GET    /api/conversations              — list conversations
 * POST   /api/conversations              — create conversation
 * GET    /api/conversations/:id          — get conversation + messages
 * DELETE /api/conversations/:id          — delete conversation
 * PATCH  /api/conversations/:id          — rename conversation
 * POST   /api/conversations/:id/messages — send a message (triggers agent)
 */

import express from 'express';
import {
  createConversation,
  listConversations,
  getConversation,
  addConversationMessage,
  deleteConversation,
  renameConversation,
  migrateConversations
} from '../../database/conversations.js';
import { executeReActLoop } from '../../agent/react-loop-v2.js';
import { broadcastMessage } from '../websocket.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Run migration on first load
try { migrateConversations(); } catch (e) { logger.warn('Conversation migration skipped', { error: e.message }); }

const USER_ID = 'default-user'; // TODO: real auth

// ============================================================================
// LIST CONVERSATIONS
// ============================================================================
router.get('/', (req, res) => {
  try {
    const userId = req.query.userId || USER_ID;
    const conversations = listConversations(userId);
    res.json({ success: true, conversations });
  } catch (err) {
    logger.error('Failed to list conversations', { error: err.message });
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// ============================================================================
// CREATE CONVERSATION
// ============================================================================
router.post('/', (req, res) => {
  try {
    const userId = req.body.userId || USER_ID;
    const platform = req.body.platform || 'web';
    const title = req.body.title || 'New Conversation';

    const conv = createConversation(userId, platform, title);
    res.json({ success: true, conversation: conv });
  } catch (err) {
    logger.error('Failed to create conversation', { error: err.message });
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// ============================================================================
// GET CONVERSATION + MESSAGES
// ============================================================================
router.get('/:id', (req, res) => {
  try {
    const userId = req.query.userId || USER_ID;
    const conv = getConversation(req.params.id, userId);

    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true, conversation: conv });
  } catch (err) {
    logger.error('Failed to get conversation', { error: err.message });
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// ============================================================================
// DELETE CONVERSATION
// ============================================================================
router.delete('/:id', (req, res) => {
  try {
    const userId = req.query.userId || USER_ID;
    const deleted = deleteConversation(req.params.id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete conversation', { error: err.message });
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ============================================================================
// RENAME CONVERSATION
// ============================================================================
router.patch('/:id', (req, res) => {
  try {
    const userId = req.body.userId || USER_ID;
    const title = req.body.title;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const renamed = renameConversation(req.params.id, userId, title);
    if (!renamed) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to rename conversation', { error: err.message });
    res.status(500).json({ error: 'Failed to rename conversation' });
  }
});

// ============================================================================
// SEND MESSAGE (triggers ReAct agent loop)
// ============================================================================
router.post('/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.body.userId || USER_ID;
    const { message, runAgent = true } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Verify conversation exists
    const conv = getConversation(conversationId, userId);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Save the user's message
    const userMsg = addConversationMessage(conversationId, 'user', message);

    // Broadcast the user message
    broadcastMessage(conversationId, {
      role: 'user',
      content: message,
      conversationId
    });

    // If this is just a chat (not a task), return immediately
    // The frontend can decide whether to run the agent
    if (!runAgent) {
      return res.json({
        success: true,
        messageId: userMsg.id,
        agentStarted: false
      });
    }

    // Run the ReAct agent loop in the background
    res.json({
      success: true,
      messageId: userMsg.id,
      agentStarted: true,
      conversationId
    });

    // Execute the agent loop asynchronously
    setImmediate(async () => {
      try {
        const result = await executeReActLoop(message, conversationId, userId, {
          workspacePath: process.env.SANDBOX_WORKSPACE || './sandbox-workspace'
        });

        // Save the agent's summary
        addConversationMessage(conversationId, 'assistant', result.summary, {
          type: 'task_complete',
          iterations: result.iterations,
          filesModified: result.filesModified
        });

        logger.info('Agent loop completed', {
          conversationId,
          iterations: result.iterations,
          success: result.success
        });
      } catch (err) {
        logger.error('Agent loop failed', { conversationId, error: err.message });
        addConversationMessage(conversationId, 'assistant', 'Error: ' + err.message, { type: 'error' });
        broadcastMessage(conversationId, {
          role: 'assistant',
          content: '❌ ' + err.message,
          type: 'error'
        });
      }
    });
  } catch (err) {
    logger.error('Failed to send message', { error: err.message });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
