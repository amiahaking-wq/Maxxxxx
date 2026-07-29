/**
 * Memory Tools — Persistent memory via SQLite + Supabase
 *
 * memory_save: Save key/value to persistent memory
 * memory_get: Retrieve by key
 * memory_list: List all memories
 * memory_delete: Delete a memory
 *
 * Also exposes semanticSearch() and getRelevantMemories() which use the
 * TF-IDF embedder to rank memories by cosine similarity to the query.
 */

import { getDatabase } from '../../database/db.js';
import { generateEmbedding } from '../../rag/embedder.js';
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
        embedding TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, memory_key)
      );
      CREATE INDEX IF NOT EXISTS idx_memory_user ON max_memory(user_id);
    `);
  } catch (e) { /* table may already exist */ }
}

ensureMemoryTable();

/**
 * Compute cosine similarity between two equal-length vectors.
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Embed text safely. Returns null if embedding fails.
 */
async function embed(text) {
  try {
    return await generateEmbedding(text);
  } catch {
    return null;
  }
}

/**
 * Serialize a vector for storage in the embedding column.
 */
function serializeVector(vec) {
  if (!vec || !Array.isArray(vec)) return '';
  try {
    return JSON.stringify(vec);
  } catch {
    return '';
  }
}

/**
 * Deserialize a vector from the embedding column.
 */
function deserializeVector(s) {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

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
        // Generate embedding for semantic search (best-effort)
        const embedding = await embed(`${args.key}: ${args.value}`);
        const embeddingStr = serializeVector(embedding);

        db.prepare(`
          INSERT INTO max_memory (user_id, memory_key, memory_value, tags, embedding, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, memory_key)
          DO UPDATE SET memory_value = excluded.memory_value,
                        tags = excluded.tags,
                        embedding = excluded.embedding,
                        updated_at = datetime('now')
        `).run('default-user', args.key, args.value, args.tags || '', embeddingStr);
        logger.info('Memory saved', { key: args.key, hasEmbedding: !!embedding });
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
 * Semantic search over all memories.
 * Generates an embedding for the query, then ranks memories by cosine
 * similarity to the query embedding. Falls back to keyword matching if
 * embeddings are unavailable.
 *
 * @param {string} query - the search query
 * @param {number} limit - max results (default 5)
 * @returns {Promise<Array<{key: string, value: string, score: number}>>}
 */
export async function semanticSearch(query, limit = 5) {
  const db = getDB();
  if (!db || !query) return [];

  let rows = [];
  try {
    rows = db.prepare('SELECT memory_key, memory_value, embedding FROM max_memory WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200')
      .all('default-user');
  } catch (e) {
    return [];
  }

  if (rows.length === 0) return [];

  // Generate embedding for the query
  const queryEmbedding = await embed(query);
  if (!queryEmbedding) {
    // Fallback: keyword matching
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const scored = rows.map(r => {
      const text = (r.memory_key + ' ' + r.memory_value).toLowerCase();
      const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
      return { key: r.memory_key, value: r.memory_value, score: score / Math.max(1, words.length) };
    }).filter(r => r.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // Rank by cosine similarity
  const scored = rows.map(r => {
    const vec = deserializeVector(r.embedding);
    if (!vec) {
      // No embedding stored — use keyword fallback for this row
      const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const text = (r.memory_key + ' ' + r.memory_value).toLowerCase();
      const score = words.reduce((s, w) => s + (text.includes(w) ? 0.3 : 0), 0);
      return { key: r.memory_key, value: r.memory_value, score };
    }
    return { key: r.memory_key, value: r.memory_value, score: cosineSimilarity(queryEmbedding, vec) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(r => r.score > 0.05).slice(0, limit);
}

/**
 * Get relevant memories for a task (for auto-injection).
 * Uses semantic search when available, falls back to keyword matching.
 *
 * @param {string} task - the user's task/prompt
 * @returns {Promise<string>} formatted memory context (empty string if none)
 */
export async function getRelevantMemories(task) {
  const db = getDB();
  if (!db) return '';

  try {
    const results = await semanticSearch(task, 5);
    if (!results || results.length === 0) return '';

    const formatted = results.map(r => '- ' + r.key + ': ' + r.value).join('\n');
    return '\n\nRelevant memories from previous sessions:\n' + formatted;
  } catch (e) {
    // Final fallback — keyword matching
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
    } catch {
      return '';
    }
  }
}

export default memoryTools;

