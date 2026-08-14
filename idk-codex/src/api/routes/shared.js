/**
 * Shared Links API (Phase 12 — Conversation Sharing)
 *
 * POST   /api/shared                  — create a shared link from a conversation
 * GET    /api/shared                  — list user's shared links
 * GET    /api/shared/:id              — get a shared link by ID (owner only)
 * GET    /api/shared/view/:id         — PUBLIC view (no auth) — returns snapshot
 * DELETE /api/shared/:id              — delete a shared link (owner only)
 */

import express from 'express';
import crypto from 'crypto';
import { getDatabase } from '../../database/db.js';
import { getConversation } from '../../database/conversations.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ============================================================================
// Ensure shared_links table exists (idempotent — matches migrate-phase12-16.sql)
// ============================================================================
function ensureTable() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_links (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT,
      messages_snapshot TEXT NOT NULL DEFAULT '[]',
      expires_at DATETIME,
      view_count INTEGER DEFAULT 0,
      last_viewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_shared_links_user ON shared_links(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_links_conversation ON shared_links(conversation_id);
  `);
}
ensureTable();

// ============================================================================
// POST /api/shared — create a shared link
// Body: { conversationId, title?, expiresInDays? }
// ============================================================================
router.post('/', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const { conversationId, title, expiresInDays } = req.body || {};

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Load the conversation (verifies ownership)
    const conversation = getConversation(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Build the messages snapshot (strip metadata we don't want public)
    const snapshot = (conversation.messages || []).map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.createdAt,
    }));

    const id = crypto.randomUUID();
    const db = getDatabase();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
      : null;

    db.prepare(`
      INSERT INTO shared_links (id, conversation_id, user_id, title, messages_snapshot, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      conversationId,
      String(userId),
      title || conversation.title || 'Shared Conversation',
      JSON.stringify(snapshot),
      expiresAt
    );

    logger.info('Shared link created', { id, conversationId, userId });

    // Build the public URL — uses /shared?id=... for client-side routing
    // (works with Next.js static export)
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `${req.protocol}://${req.get('host')}`;
    const publicUrl = `${baseUrl}/shared?id=${id}`;

    res.json({
      success: true,
      sharedLink: {
        id,
        conversationId,
        title: title || conversation.title,
        url: publicUrl,
        expiresAt,
        createdAt: new Date().toISOString(),
        messageCount: snapshot.length,
      },
    });
  } catch (err) {
    logger.error('Failed to create shared link', { error: err.message });
    res.status(500).json({ error: 'Failed to create shared link: ' + err.message });
  }
});

// ============================================================================
// GET /api/shared — list user's shared links
// ============================================================================
router.get('/', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();

    const links = db.prepare(`
      SELECT id, conversation_id, title, view_count, last_viewed_at, expires_at, created_at
      FROM shared_links
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(String(userId));

    res.json({
      success: true,
      sharedLinks: links.map(l => ({
        id: l.id,
        conversationId: l.conversation_id,
        title: l.title,
        viewCount: l.view_count || 0,
        lastViewedAt: l.last_viewed_at,
        expiresAt: l.expires_at,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list shared links: ' + err.message });
  }
});

// ============================================================================
// GET /api/shared/:id — get a shared link (owner only)
// ============================================================================
router.get('/:id', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();

    const link = db.prepare(`
      SELECT * FROM shared_links WHERE id = ? AND user_id = ?
    `).get(req.params.id, String(userId));

    if (!link) {
      return res.status(404).json({ error: 'Shared link not found' });
    }

    res.json({
      success: true,
      sharedLink: {
        id: link.id,
        conversationId: link.conversation_id,
        title: link.title,
        messages: JSON.parse(link.messages_snapshot || '[]'),
        viewCount: link.view_count || 0,
        lastViewedAt: link.last_viewed_at,
        expiresAt: link.expires_at,
        createdAt: link.created_at,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get shared link: ' + err.message });
  }
});

// ============================================================================
// GET /api/shared/view/:id — PUBLIC view (no auth required)
// Returns the snapshot + increments view count
// ============================================================================
router.get('/view/:id', (req, res) => {
  try {
    const db = getDatabase();

    const link = db.prepare(`
      SELECT * FROM shared_links WHERE id = ?
    `).get(req.params.id);

    if (!link) {
      return res.status(404).json({ error: 'Shared link not found or expired' });
    }

    // Check expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This shared link has expired' });
    }

    // Increment view count
    db.prepare(`
      UPDATE shared_links
      SET view_count = view_count + 1, last_viewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(link.id);

    res.json({
      success: true,
      title: link.title,
      messages: JSON.parse(link.messages_snapshot || '[]'),
      createdAt: link.created_at,
      viewCount: (link.view_count || 0) + 1,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to view shared link: ' + err.message });
  }
});

// ============================================================================
// DELETE /api/shared/:id — delete a shared link (owner only)
// ============================================================================
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();

    const result = db.prepare(`
      DELETE FROM shared_links WHERE id = ? AND user_id = ?
    `).run(req.params.id, String(userId));

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Shared link not found' });
    }

    logger.info('Shared link deleted', { id: req.params.id, userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete shared link: ' + err.message });
  }
});

export default router;
