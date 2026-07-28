/**
 * Memory + User Profile API Routes
 * GET  /api/memory           — list memories
 * POST /api/memory           — save a memory
 * DELETE /api/memory/:key    — delete a memory
 * GET  /api/user/profile     — get user profile
 * POST /api/user/profile     — save user profile
 */

import express from 'express';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ============================================================================
// MEMORY
// ============================================================================

router.get('/memory', (req, res) => {
  try {
    const userId = req.query.userId || 'web_user';
    const db = getDatabase();
    const memories = db.prepare('SELECT key, value, created_at FROM max_memory WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    res.json({ memories });
  } catch (e) {
    // Table might not exist — return empty
    res.json({ memories: [] });
  }
});

router.post('/memory', (req, res) => {
  try {
    const { userId = 'web_user', key, value } = req.body;
    if (!key || !value) return res.status(400).json({ error: 'key and value required' });
    const db = getDatabase();
    db.prepare('INSERT OR REPLACE INTO max_memory (user_id, key, value, created_at) VALUES (?, ?, ?, datetime(\'now\'))').run(userId, key, value);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/memory/:key', (req, res) => {
  try {
    const userId = req.query.userId || 'web_user';
    const db = getDatabase();
    db.prepare('DELETE FROM max_memory WHERE user_id = ? AND key = ?').run(userId, req.params.key);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// USER PROFILE
// ============================================================================

router.get('/user/profile', (req, res) => {
  try {
    const userId = req.query.userId || 'web_user';
    const db = getDatabase();
    const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
    res.json({ profile: prefs || {} });
  } catch (e) {
    res.json({ profile: {} });
  }
});

router.post('/user/profile', (req, res) => {
  try {
    const { userId = 'web_user', name, role, company, goals, preferredModel, language, timezone } = req.body;
    const db = getDatabase();
    db.prepare(`
      INSERT INTO user_preferences (user_id, repo_owner, repo_name, preferred_model, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET updated_at = datetime('now')
    `).run(userId, null, null, preferredModel || null);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
