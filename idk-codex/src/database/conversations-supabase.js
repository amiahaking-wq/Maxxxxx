/**
 * Supabase-backed conversation storage
 *
 * When Supabase is configured (SUPABASE_URL + SUPABASE_KEY), conversations
 * and messages are stored in Supabase (persistent across Railway restarts).
 * When not configured, falls back to local SQLite (ephemeral).
 */

import { getDatabase } from './db.js';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || null;

export function isSupabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

// ============================================================================
// SUPABASE API CALLS
// ============================================================================

async function supabaseFetch(endpoint, method = 'GET', body = null) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : 'return=representation'
    },
    body: body ? JSON.stringify(body) : null
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase error ${response.status}: ${text}`);
  }

  return response.json();
}

// ============================================================================
// CONVERSATIONS
// ============================================================================

export async function createConversation(userId, platform = 'web', title = 'New Conversation') {
  const id = crypto.randomUUID();

  if (isSupabaseConfigured()) {
    try {
      // Include session_id in case the table has that column (from old schema)
      const result = await supabaseFetch('conversations', 'POST', {
        id, user_id: String(userId), title, platform,
        session_id: id  // some Supabase tables have this from old schema
      });
      logger.info('Conversation created in Supabase', { id });
      return { id, userId, title, platform };
    } catch (err) {
      logger.warn('Supabase create failed, using SQLite', { error: err.message });
      // Fall through to SQLite
    }
  }

  // Fallback to SQLite
  const db = getDatabase();
  db.prepare('INSERT INTO conversations (id, user_id, title, platform) VALUES (?, ?, ?, ?)')
    .run(id, String(userId), title, platform);
  return { id, userId, title, platform };
}

export async function listConversations(userId, limit = 50) {
  if (isSupabaseConfigured()) {
    try {
      const result = await supabaseFetch(
        `conversations?user_id=eq.${String(userId)}&order=updated_at.desc&limit=${limit}`,
        'GET'
      );

      // Get message previews
      const conversations = [];
      for (const conv of result) {
        const messages = await supabaseFetch(
          `conversation_messages?conversation_id=eq.${conv.id}&order=created_at.desc&limit=1`,
          'GET'
        );
        conversations.push({
          id: conv.id,
          title: conv.title,
          platform: conv.platform,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
          preview: messages[0]?.content?.substring(0, 100) || '',
          messageCount: 0
        });
      }
      return conversations;
    } catch (err) {
      logger.warn('Supabase list failed, using SQLite', { error: err.message });
    }
  }

  // Fallback to SQLite
  const db = getDatabase();
  const conversations = db.prepare(`
    SELECT c.id, c.title, c.platform, c.created_at, c.updated_at,
      (SELECT content FROM conversation_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = c.id) as message_count
    FROM conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC LIMIT ?
  `).all(String(userId), limit);

  return conversations.map(c => ({
    id: c.id, title: c.title, platform: c.platform,
    createdAt: c.created_at, updatedAt: c.updated_at,
    preview: c.last_message?.substring(0, 100) || '',
    messageCount: c.message_count || 0
  }));
}

export async function getConversation(conversationId, userId) {
  if (isSupabaseConfigured()) {
    try {
      const convs = await supabaseFetch(`conversations?id=eq.${conversationId}&user_id=eq.${String(userId)}`, 'GET');
      if (!convs || convs.length === 0) return null;

      const conv = convs[0];
      const messages = await supabaseFetch(
        `conversation_messages?conversation_id=eq.${conversationId}&order=created_at.asc`,
        'GET'
      );

      return {
        ...conv,
        messages: messages.map(m => ({
          id: m.id, role: m.role, content: m.content,
          metadata: m.metadata, createdAt: m.created_at
        }))
      };
    } catch (err) {
      logger.warn('Supabase get failed, using SQLite', { error: err.message });
    }
  }

  // Fallback to SQLite
  const db = getDatabase();
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .get(conversationId, String(userId));
  if (!conversation) return null;

  const messages = db.prepare('SELECT id, role, content, metadata, created_at FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId);

  return {
    ...conversation,
    messages: messages.map(m => ({
      id: m.id, role: m.role, content: m.content,
      metadata: m.metadata ? JSON.parse(m.metadata) : null,
      createdAt: m.created_at
    }))
  };
}

export async function addConversationMessage(conversationId, role, content, metadata = null, options = {}) {
  const id = crypto.randomUUID();
  // Caller can pass a userId + platform so we create the conversation row with the right owner
  const ownerId = options.userId || 'telegram_user';
  const platform = options.platform || 'telegram';

  if (isSupabaseConfigured()) {
    try {
      // ROBUST FK FIX: Always upsert the conversation row BEFORE inserting the message.
      // Use POST with Prefer: resolution=merge-duplicates so if the row already exists,
      // it's a no-op; if it doesn't, it's created. This eliminates the FK constraint error.
      try {
        const title = role === 'user'
          ? (content.substring(0, 50) + (content.length > 50 ? '...' : ''))
          : 'Telegram Chat';
        await supabaseFetch('conversations', 'POST', {
          id: conversationId,
          user_id: String(ownerId),
          platform,
          title,
          session_id: conversationId
        });
        logger.info('Conversation upserted in Supabase', { conversationId, ownerId, platform });
      } catch (e) {
        // If upsert failed because row already exists (42201 / 23505), that's fine.
        // Otherwise log it but continue — the message insert below will surface any real FK error.
        if (!String(e.message).includes('duplicate') && !String(e.message).includes('23505')) {
          logger.debug('Conversation upsert note', { conversationId, error: e.message });
        }
      }

      try {
        await supabaseFetch('conversation_messages', 'POST', {
          id, conversation_id: conversationId, role, content,
          metadata: metadata || null
        });
      } catch (msgErr) {
        // If FK constraint still fails, retry with a fresh conversation insert + retry message
        if (String(msgErr.message).includes('foreign key') || String(msgErr.message).includes('23503')) {
          logger.warn('FK retry — re-creating conversation', { conversationId });
          // Force-create with a PATCH (upsert semantics)
          try {
            await supabaseFetch(`conversations?id=eq.${conversationId}`, 'PATCH', {
              user_id: String(ownerId),
              platform,
              updated_at: new Date().toISOString()
            });
          } catch (patchErr) { /* may not exist yet — try POST again */ }
          await supabaseFetch('conversation_messages', 'POST', {
            id, conversation_id: conversationId, role, content,
            metadata: metadata || null
          });
        } else {
          throw msgErr;
        }
      }

      // Update conversation's updated_at (non-fatal if this fails)
      try {
        await supabaseFetch(`conversations?id=eq.${conversationId}`, 'PATCH', {
          updated_at: new Date().toISOString()
        });
      } catch (e) { /* non-fatal */ }

      // Auto-generate title from first user message (non-fatal)
      if (role === 'user') {
        try {
          const convs = await supabaseFetch(`conversations?id=eq.${conversationId}&select=id,title`, 'GET');
          if (convs[0] && (convs[0].title === 'New Conversation' || !convs[0].title || convs[0].title === 'Telegram Chat')) {
            const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
            await supabaseFetch(`conversations?id=eq.${conversationId}`, 'PATCH', { title });
          }
        } catch (e) { /* non-fatal */ }
      }

      return { id, conversationId, role, content, metadata };
    } catch (err) {
      logger.warn('Supabase add message failed, using SQLite', { error: err.message });
    }
  }

  // Fallback to SQLite
  const db = getDatabase();
  db.prepare('INSERT INTO conversation_messages (id, conversation_id, role, content, metadata) VALUES (?, ?, ?, ?, ?)')
    .run(id, conversationId, role, content, metadata ? JSON.stringify(metadata) : null);

  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(conversationId);

  if (role === 'user') {
    const conversation = db.prepare('SELECT title FROM conversations WHERE id = ?').get(conversationId);
    if (conversation && (conversation.title === 'New Conversation' || !conversation.title)) {
      const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
      db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, conversationId);
    }
  }

  return { id, conversationId, role, content, metadata };
}

export async function deleteConversation(conversationId, userId) {
  if (isSupabaseConfigured()) {
    try {
      await supabaseFetch(`conversation_messages?conversation_id=eq.${conversationId}`, 'DELETE');
      await supabaseFetch(`conversations?id=eq.${conversationId}&user_id=eq.${String(userId)}`, 'DELETE');
      return true;
    } catch (err) {
      logger.warn('Supabase delete failed, using SQLite', { error: err.message });
    }
  }

  const db = getDatabase();
  const result = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
    .run(conversationId, String(userId));
  return result.changes > 0;
}

export async function renameConversation(conversationId, userId, title) {
  if (isSupabaseConfigured()) {
    try {
      await supabaseFetch(`conversations?id=eq.${conversationId}&user_id=eq.${String(userId)}`, 'PATCH', {
        title, updated_at: new Date().toISOString()
      });
      return true;
    } catch (err) {
      logger.warn('Supabase rename failed, using SQLite', { error: err.message });
    }
  }

  const db = getDatabase();
  const result = db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .run(title, conversationId, String(userId));
  return result.changes > 0;
}

export default {
  isSupabaseConfigured,
  createConversation,
  listConversations,
  getConversation,
  addConversationMessage,
  deleteConversation,
  renameConversation
};
