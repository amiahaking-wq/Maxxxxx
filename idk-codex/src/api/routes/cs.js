/**
 * Customer Service API Routes — Stage 8D
 *
 * POST /api/cs/message — public endpoint for other Telegram bots to
 *   forward customer messages to MAX for handling.
 *
 * GET  /api/cs/profile — get the active business profile
 * POST /api/cs/profile — create or update a business profile
 * GET  /api/cs/profiles — list all business profiles
 * GET  /api/cs/conversations — list customer conversations
 */

import express from 'express';
import {
  CustomerServiceAgent,
  saveBusinessProfile,
  getActiveBusinessProfile,
  listBusinessProfiles
} from '../../modes/customer-service.js';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * POST /api/cs/message
 * Public endpoint — any Telegram bot can forward customer messages here.
 *
 * Body: {
 *   businessOwnerId: string,  — the MAX user who owns this business
 *   customerId: string,       — unique customer identifier (Telegram ID, etc.)
 *   customerName: string,     — display name
 *   message: string,          — the customer's message
 *   channel: string           — 'telegram' | 'web' | 'whatsapp' (default 'telegram')
 * }
 *
 * Returns: { reply, escalated, conversationSaved }
 */
router.post('/message', async (req, res) => {
  try {
    const { businessOwnerId, customerId, customerName, message, channel } = req.body;

    if (!businessOwnerId || !customerId || !message) {
      return res.status(400).json({
        error: 'businessOwnerId, customerId, and message are required'
      });
    }

    // Get the active business profile for this owner
    const profile = getActiveBusinessProfile(businessOwnerId);
    if (!profile) {
      return res.status(404).json({
        error: 'No active business profile found. Use POST /api/cs/profile to create one.'
      });
    }

    // Create the CS agent and handle the message
    const agent = new CustomerServiceAgent(businessOwnerId, profile);
    const result = await agent.handleMessage(
      customerId,
      customerName || 'Anonymous',
      message,
      channel || 'telegram'
    );

    logger.info('CS message processed', {
      businessOwnerId,
      business: profile.business_name,
      customerId,
      escalated: result.escalated
    });

    res.json({
      success: true,
      reply: result.reply,
      escalated: result.escalated,
      conversationSaved: result.conversationSaved
    });
  } catch (err) {
    logger.error('CS message endpoint failed', { error: err.message });
    res.status(500).json({ error: 'Failed to process message: ' + err.message });
  }
});

/**
 * GET /api/cs/profile
 * Get the active business profile for the current user.
 */
router.get('/profile', (req, res) => {
  try {
    const userId = req.query.userId || 'default-user';
    const profile = getActiveBusinessProfile(userId);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/cs/profile
 * Create or update a business profile.
 */
router.post('/profile', (req, res) => {
  try {
    const userId = req.body.userId || 'default-user';
    const profile = req.body.profile || req.body;
    if (!profile.business_name) {
      return res.status(400).json({ error: 'business_name is required' });
    }
    const saved = saveBusinessProfile(userId, profile);
    logger.info('Business profile saved', { userId, business: profile.business_name });
    res.json({ success: true, profile: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/cs/profiles
 * List all business profiles for the current user.
 */
router.get('/profiles', (req, res) => {
  try {
    const userId = req.query.userId || 'default-user';
    const profiles = listBusinessProfiles(userId);
    res.json({ success: true, profiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/cs/conversations
 * List customer conversations for the current user's business.
 */
router.get('/conversations', (req, res) => {
  try {
    const userId = req.query.userId || 'default-user';
    const limit = parseInt(req.query.limit) || 20;
    const db = getDatabase();

    const conversations = db.prepare(`
      SELECT id, customer_identifier, customer_name, channel,
             sentiment, is_resolved, escalated, created_at, updated_at
      FROM max_customer_conversations
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(userId, limit);

    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/cs/conversations/:id
 * Get full conversation history for a specific customer conversation.
 */
router.get('/conversations/:id', (req, res) => {
  try {
    const db = getDatabase();
    const conv = db.prepare(`
      SELECT * FROM max_customer_conversations WHERE id = ?
    `).get(req.params.id);

    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    let history = [];
    try { history = JSON.parse(conv.conversation_history); } catch (e) { /* ok */ }

    res.json({ success: true, conversation: { ...conv, conversation_history: history } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
