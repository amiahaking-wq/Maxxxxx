/**
 * Custom GPTs API (Phase 13-14)
 *
 * POST   /api/gpts              — create a new GPT
 * GET    /api/gpts              — list user's GPTs
 * GET    /api/gpts/:id          — get a single GPT (owner or public)
 * PATCH  /api/gpts/:id          — update a GPT (owner only)
 * DELETE /api/gpts/:id          — delete a GPT (owner only)
 * GET    /api/gpts/store        — list public GPTs (store)
 * POST   /api/gpts/:id/use      — increment usage count + return full config
 */

import express from 'express';
import crypto from 'crypto';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ============================================================================
// Ensure gpts table exists
// ============================================================================
function ensureTable() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS gpts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      instructions TEXT,
      system_prompt TEXT,
      knowledge_files TEXT DEFAULT '[]',
      allowed_tools TEXT,
      icon_color TEXT DEFAULT '#10a37f',
      visibility TEXT DEFAULT 'private' CHECK(visibility IN ('private', 'public')),
      category TEXT,
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gpts_user ON gpts(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gpts_public ON gpts(visibility, usage_count DESC) WHERE visibility = 'public';
  `);
}
ensureTable();

function serializeGpt(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    systemPrompt: row.system_prompt,
    knowledgeFiles: JSON.parse(row.knowledge_files || '[]'),
    allowedTools: row.allowed_tools ? JSON.parse(row.allowed_tools) : null,
    iconColor: row.icon_color || '#10a37f',
    visibility: row.visibility,
    category: row.category,
    usageCount: row.usage_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// POST /api/gpts — create
// ============================================================================
router.post('/', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const { name, description, instructions, systemPrompt, knowledgeFiles, allowedTools, iconColor, visibility, category } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const id = crypto.randomUUID();
    const db = getDatabase();

    db.prepare(`
      INSERT INTO gpts (id, user_id, name, description, instructions, system_prompt, knowledge_files, allowed_tools, icon_color, visibility, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(userId),
      name.trim(),
      description || '',
      instructions || '',
      systemPrompt || '',
      JSON.stringify(knowledgeFiles || []),
      allowedTools ? JSON.stringify(allowedTools) : null,
      iconColor || '#10a37f',
      visibility || 'private',
      category || null
    );

    const row = db.prepare('SELECT * FROM gpts WHERE id = ?').get(id);
    logger.info('GPT created', { id, userId, name });
    res.json({ success: true, gpt: serializeGpt(row) });
  } catch (err) {
    logger.error('Failed to create GPT', { error: err.message });
    res.status(500).json({ error: 'Failed to create GPT: ' + err.message });
  }
});

// ============================================================================
// GET /api/gpts — list user's GPTs
// ============================================================================
router.get('/', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM gpts WHERE user_id = ? ORDER BY updated_at DESC').all(String(userId));
    res.json({ success: true, gpts: rows.map(serializeGpt) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list GPTs: ' + err.message });
  }
});

// ============================================================================
// GET /api/gpts/store — list public GPTs
// ============================================================================
router.get('/store', (req, res) => {
  try {
    const db = getDatabase();
    const { category, search, limit } = req.query;
    let query = 'SELECT * FROM gpts WHERE visibility = ?';
    const params = ['public'];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(String(category));
    }
    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY usage_count DESC LIMIT ?';
    params.push(parseInt(String(limit || 50), 10));

    const rows = db.prepare(query).all(...params);
    res.json({ success: true, gpts: rows.map(serializeGpt) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list store GPTs: ' + err.message });
  }
});

// ============================================================================
// GET /api/gpts/:id — get single (owner or public)
// ============================================================================
router.get('/:id', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM gpts WHERE id = ?').get(req.params.id);

    if (!row) return res.status(404).json({ error: 'GPT not found' });

    // Only owner can see private GPTs
    if (row.visibility !== 'public' && row.user_id !== String(userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ success: true, gpt: serializeGpt(row) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get GPT: ' + err.message });
  }
});

// ============================================================================
// PATCH /api/gpts/:id — update (owner only)
// ============================================================================
router.patch('/:id', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM gpts WHERE id = ? AND user_id = ?').get(req.params.id, String(userId));

    if (!existing) return res.status(404).json({ error: 'GPT not found or access denied' });

    const { name, description, instructions, systemPrompt, knowledgeFiles, allowedTools, iconColor, visibility, category } = req.body || {};

    db.prepare(`
      UPDATE gpts SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        instructions = COALESCE(?, instructions),
        system_prompt = COALESCE(?, system_prompt),
        knowledge_files = COALESCE(?, knowledge_files),
        allowed_tools = COALESCE(?, allowed_tools),
        icon_color = COALESCE(?, icon_color),
        visibility = COALESCE(?, visibility),
        category = COALESCE(?, category),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name ?? null,
      description ?? null,
      instructions ?? null,
      systemPrompt ?? null,
      knowledgeFiles ? JSON.stringify(knowledgeFiles) : null,
      allowedTools ? JSON.stringify(allowedTools) : null,
      iconColor ?? null,
      visibility ?? null,
      category ?? null,
      req.params.id
    );

    const row = db.prepare('SELECT * FROM gpts WHERE id = ?').get(req.params.id);
    res.json({ success: true, gpt: serializeGpt(row) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update GPT: ' + err.message });
  }
});

// ============================================================================
// DELETE /api/gpts/:id — delete (owner only)
// ============================================================================
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();
    const result = db.prepare('DELETE FROM gpts WHERE id = ? AND user_id = ?').run(req.params.id, String(userId));

    if (result.changes === 0) return res.status(404).json({ error: 'GPT not found or access denied' });

    logger.info('GPT deleted', { id: req.params.id, userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete GPT: ' + err.message });
  }
});

// ============================================================================
// POST /api/gpts/:id/use — increment usage + return config
// ============================================================================
router.post('/:id/use', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM gpts WHERE id = ?').get(req.params.id);

    if (!row) return res.status(404).json({ error: 'GPT not found' });
    if (row.visibility !== 'public' && row.user_id !== String(userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('UPDATE gpts SET usage_count = usage_count + 1 WHERE id = ?').run(req.params.id);
    const updated = db.prepare('SELECT * FROM gpts WHERE id = ?').get(req.params.id);
    res.json({ success: true, gpt: serializeGpt(updated) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to use GPT: ' + err.message });
  }
});

export default router;
