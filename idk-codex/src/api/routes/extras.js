/**
 * Memory + User Profile API Routes
 * GET  /api/memory           — list memories
 * POST /api/memory           — save a memory
 * DELETE /api/memory/:key    — delete a memory
 * GET  /api/user/profile     — get user profile
 * POST /api/user/profile     — save user profile
 */

import express from 'express';
import { optionalAuth } from '../../auth/middleware.js';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Apply optionalAuth — extracts user from JWT if present
router.use(optionalAuth);

// ============================================================================
// MEMORY
// ============================================================================

router.get('/memory', (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();
    const memories = db.prepare('SELECT key, value, created_at FROM max_memory WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    res.json({ memories });
  } catch (e) {
    res.json({ memories: [] });
  }
});

router.post('/memory', (req, res) => {
  try {
    const userId = req.user.id;
    const { key, value } = req.body;
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
    const userId = req.user.id;
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

router.post('/user/profile', (req, res) => {
  try {
    const userId = req.user.id;
    const { name, role, company, goals, preferredModel, language, timezone } = req.body;
    const db = getDatabase();

    // Save profile fields. We use a separate table for the extended profile
    // to avoid breaking the existing user_preferences schema.
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS max_user_profiles (
          user_id TEXT PRIMARY KEY,
          name TEXT,
          role TEXT,
          company TEXT,
          goals TEXT,
          language TEXT,
          timezone TEXT,
          updated_at TEXT
        )
      `).run();
      db.prepare(`
        INSERT INTO max_user_profiles (user_id, name, role, company, goals, language, timezone, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          name = excluded.name,
          role = excluded.role,
          company = excluded.company,
          goals = excluded.goals,
          language = excluded.language,
          timezone = excluded.timezone,
          updated_at = datetime('now')
      `).run(userId, name || null, role || null, company || null, goals || null, language || null, timezone || null);
    } catch (profileErr) { /* non-fatal */ }

    // Also update preferred model in user_preferences (legacy compatibility)
    try {
      db.prepare(`
        INSERT INTO user_preferences (user_id, repo_owner, repo_name, preferred_model, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          preferred_model = excluded.preferred_model,
          updated_at = datetime('now')
      `).run(userId, null, null, preferredModel || null);
    } catch (prefErr) { /* non-fatal */ }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get extended profile (name, role, company, goals, language)
router.get('/user/profile', (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();

    let extendedProfile = {};
    try {
      db.prepare('CREATE TABLE IF NOT EXISTS max_user_profiles (user_id TEXT PRIMARY KEY, name TEXT, role TEXT, company TEXT, goals TEXT, language TEXT, timezone TEXT, updated_at TEXT)').run();
      const row = db.prepare('SELECT * FROM max_user_profiles WHERE user_id = ?').get(userId);
      if (row) extendedProfile = row;
    } catch (e) { /* non-fatal */ }

    const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
    res.json({
      profile: {
        ...extendedProfile,
        preferredModel: prefs?.preferred_model || null
      }
    });
  } catch (e) {
    res.json({ profile: {} });
  }
});

export default router;
