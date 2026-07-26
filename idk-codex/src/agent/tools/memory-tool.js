/**
 * Memory Tools — Persistent memory via Supabase
 *
 * memory_save: Save something to persistent memory (survives restarts)
 * memory_get: Retrieve something from memory
 * memory_list: List all saved memories or search by tag
 *
 * Uses Supabase max_memory table. Falls back to in-memory if not configured.
 */

import { isSupabaseConfigured } from '../supabase-storage.js';
import logger from '../../utils/logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || null;

// In-memory fallback
const localMemory = new Map();

async function supabaseUpsert(key, value, tags) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/max_memory`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates'
    },
    body: JSON.stringify({
      user_id: 'default-user',
      key,
      value,
      tags: tags || [],
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) throw new Error('Supabase error: ' + response.status);
  return response.json();
}

async function supabaseGet(key) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/max_memory?user_id=eq.default-user&key=eq.${encodeURIComponent(key)}&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );
  if (!response.ok) throw new Error('Supabase error: ' + response.status);
  const data = await response.json();
  return data[0]?.value || null;
}

async function supabaseList(tag) {
  let url = `${SUPABASE_URL}/rest/v1/max_memory?user_id=eq.default-user&order=updated_at.desc&limit=20`;
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!response.ok) throw new Error('Supabase error: ' + response.status);
  return response.json();
}

export const memoryTools = {
  memory_save: {
    name: 'memory_save',
    description: 'Save something to persistent memory — survives restarts. Use for: API keys, URLs, preferences, project details.',
    params: {
      key: 'string (required) — unique key name',
      value: 'string (required) — value to remember',
      tags: 'string (optional) — comma-separated tags for categorization'
    },
    execute: async (args) => {
      if (!args.key || args.value === undefined) return 'Error: key and value are required';
      
      const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];

      if (isSupabaseConfigured()) {
        try {
          await supabaseUpsert(args.key, args.value, tags);
          logger.info('Memory saved to Supabase', { key: args.key });
          return 'Saved to memory: ' + args.key;
        } catch (err) {
          logger.warn('Supabase memory save failed, using local', { error: err.message });
        }
      }

      // Local fallback
      localMemory.set(args.key, { value: args.value, tags });
      return 'Saved to memory (local): ' + args.key;
    }
  },

  memory_get: {
    name: 'memory_get',
    description: 'Retrieve something from persistent memory by key.',
    params: { key: 'string (required) — key to retrieve' },
    execute: async (args) => {
      if (!args.key) return 'Error: key is required';

      if (isSupabaseConfigured()) {
        try {
          const value = await supabaseGet(args.key);
          if (value) return value;
          return 'No memory found for key: ' + args.key;
        } catch (err) {
          logger.warn('Supabase memory get failed, using local', { error: err.message });
        }
      }

      // Local fallback
      const entry = localMemory.get(args.key);
      return entry?.value || 'No memory found for key: ' + args.key;
    }
  },

  memory_list: {
    name: 'memory_list',
    description: 'List all saved memories.',
    params: { tag: 'string (optional) — filter by tag' },
    execute: async (args) => {
      if (isSupabaseConfigured()) {
        try {
          const data = await supabaseList(args.tag);
          if (!data || data.length === 0) return 'No memories saved.';
          return data.map(m => '- ' + m.key + ': ' + m.value.substring(0, 100) + (m.tags?.length ? ' [tags: ' + m.tags.join(', ') + ']' : '')).join('\n');
        } catch (err) {
          logger.warn('Supabase memory list failed, using local', { error: err.message });
        }
      }

      // Local fallback
      if (localMemory.size === 0) return 'No memories saved.';
      const entries = Array.from(localMemory.entries());
      return entries.map(([k, v]) => '- ' + k + ': ' + v.value.substring(0, 100)).join('\n');
    }
  }
};

export default memoryTools;
