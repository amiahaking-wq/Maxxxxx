/**
 * Memory Tools — Persistent memory via SQLite + Supabase
 *
 * memory_save: Save key/value to persistent memory
 * memory_get: Retrieve by key
 * memory_list: List all memories
 * memory_delete: Delete a memory
 */

import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';

function getDB() {
  try { return getDatabase(); } catch (e) { return null; }
}

function ensureMemoryTable() {
  const db = getDB();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS max_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default-user',
        memory_key TEXT NOT NULL,
        memory_value TEXT NOT NULL,
        tags TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, memory_key)
      );
      CREATE INDEX IF NOT EXISTS idx_memory_user ON max_memory(user_id);
    `);
  } catch (e) { /* table may already exist */ }
}

ensureMemoryTable();

export const memoryTools = {
  memory_save: {
    name: 'memory_save',
    description: 'Save something to persistent memory — survives restarts',
    params: {
      key: 'string (required) — unique key name',
      value: 'string (required) — value to remember',
      tags: 'string (optional) — comma-separated tags'
    },
    execute: async (args) => {
      if (!args.key || args.value === undefined) return 'Error: key and value required';
      const db = getDB();
      if (!db) return 'Error: database not available';

      try {
        db.prepare(`
          INSERT INTO max_memory (user_id, memory_key, memory_value, tags, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, memory_key)
          DO UPDATE SET memory_value = excluded.memory_value,
                        tags = excluded.tags,
                        updated_at = datetime('now')
        `).run('default-user', args.key, args.value, args.tags || '');
        logger.info('Memory saved', { key: args.key });
        return 'Saved to memory: ' + args.key;
      } catch (err) {
        return 'Error saving memory: ' + err.message;
      }
    }
  },

  memory_get: {
    name: 'memory_get',
    description: 'Retrieve something from persistent memory by key',
    params: { key: 'string (required)' },
    execute: async (args) => {
      if (!args.key) return 'Error: key is required';
      const db = getDB();
      if (!db) return 'Error: database not available';

      try {
        const row = db.prepare('SELECT memory_value FROM max_memory WHERE user_id = ? AND memory_key = ?')
          .get('default-user', args.key);
        return row?.memory_value || 'No memory found for key: ' + args.key;
      } catch (err) {
        return 'Error: ' + err.message;
      }
    }
  },

  memory_list: {
    name: 'memory_list',
    description: 'List all saved memories',
    params: {},
    execute: async () => {
      const db = getDB();
      if (!db) return 'Error: database not available';

      try {
        const rows = db.prepare('SELECT memory_key, memory_value, updated_at FROM max_memory WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30')
          .all('default-user');
        if (!rows.length) return 'No memories saved yet.';
        return rows.map(r => '[' + r.memory_key + ']: ' + r.memory_value.substring(0, 100)).join('\n');
      } catch (err) {
        return 'Error: ' + err.message;
      }
    }
  },

  memory_delete: {
    name: 'memory_delete',
    description: 'Delete a memory by key',
    params: { key: 'string (required)' },
    execute: async (args) => {
      if (!args.key) return 'Error: key is required';
      const db = getDB();
      if (!db) return 'Error: database not available';

      try {
        db.prepare('DELETE FROM max_memory WHERE user_id = ? AND memory_key = ?')
          .run('default-user', args.key);
        return 'Deleted memory: ' + args.key;
      } catch (err) {
        return 'Error: ' + err.message;
      }
    }
  }
};

/**
 * Get relevant memories for a task (for auto-injection)
 */
export function getRelevantMemories(task) {
  const db = getDB();
  if (!db) return '';

  try {
    const words = task.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 10);
    const allMemories = db.prepare('SELECT memory_key, memory_value FROM max_memory WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50')
      .all('default-user');

    const relevant = allMemories.filter(m =>
      words.some(w =>
        m.memory_key.toLowerCase().includes(w) ||
        m.memory_value.toLowerCase().includes(w)
      )
    ).slice(0, 5);

    if (!relevant.length) return '';

    return '\n\nRelevant memories from previous sessions:\n' +
      relevant.map(m => '- ' + m.memory_key + ': ' + m.memory_value).join('\n');
  } catch (e) {
    return '';
  }
}

export default memoryTools;
