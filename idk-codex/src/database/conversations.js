/**
 * Conversations schema + queries for MAX 2.0
 *
 * Each conversation has:
 *   - id (UUID)
 *   - user_id
 *   - title (auto-generated from first message)
 *   - platform (web, telegram)
 *   - created_at, updated_at
 *   - messages (1-to-many)
 *
 * Messages belong to a conversation and have:
 *   - role (user, assistant, system, tool)
 *   - content
 *   - metadata (JSON — tool calls, results, etc.)
 */

import { getDatabase } from './db.js';
import crypto from 'crypto';
import logger from '../utils/logger.js';

// ============================================================================
// SCHEMA MIGRATION
// ============================================================================

export function migrateConversations() {
  const db = getDatabase();

  try {
    // Create conversations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT DEFAULT 'New Conversation',
        platform TEXT DEFAULT 'web',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES sessions(user_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv ON conversation_messages(conversation_id, created_at);
    `);

    logger.info('Conversations schema migrated successfully');
  } catch (error) {
    logger.error('Failed to migrate conversations schema', { error: error.message });
    throw error;
  }
}

// ============================================================================
// CONVERSATION QUERIES
// ============================================================================

/**
 * Create a new conversation
 */
export function createConversation(userId, platform = 'web', title = 'New Conversation') {
  const db = getDatabase();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO conversations (id, user_id, title, platform)
    VALUES (?, ?, ?, ?)
  `).run(id, String(userId), title, platform);

  logger.info('Conversation created', { id, userId, title });
  return { id, userId, title, platform };
}

/**
 * List all conversations for a user, most recent first
 */
export function listConversations(userId, limit = 50) {
  const db = getDatabase();

  const conversations = db.prepare(`
    SELECT
      c.id,
      c.title,
      c.platform,
      c.created_at,
      c.updated_at,
      (SELECT content FROM conversation_messages
       WHERE conversation_id = c.id AND role = 'user'
       ORDER BY created_at ASC LIMIT 1) as first_message,
      (SELECT content FROM conversation_messages
       WHERE conversation_id = c.id
       ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT COUNT(*) FROM conversation_messages
       WHERE conversation_id = c.id) as message_count
    FROM conversations c
    WHERE c.user_id = ?
    ORDER BY c.updated_at DESC
    LIMIT ?
  `).all(String(userId), limit);

  return conversations.map(c => ({
    id: c.id,
    title: c.title,
    platform: c.platform,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    preview: c.last_message ? c.last_message.substring(0, 100) : '',
    messageCount: c.message_count || 0
  }));
}

/**
 * Get a single conversation with its messages
 */
export function getConversation(conversationId, userId) {
  const db = getDatabase();

  const conversation = db.prepare(`
    SELECT * FROM conversations WHERE id = ? AND user_id = ?
  `).get(conversationId, String(userId));

  if (!conversation) return null;

  const messages = db.prepare(`
    SELECT id, role, content, metadata, created_at
    FROM conversation_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(conversationId);

  return {
    ...conversation,
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      metadata: m.metadata ? JSON.parse(m.metadata) : null,
      createdAt: m.created_at
    }))
  };
}

/**
 * Add a message to a conversation
 */
export function addConversationMessage(conversationId, role, content, metadata = null) {
  const db = getDatabase();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO conversation_messages (id, conversation_id, role, content, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, conversationId, role, content, metadata ? JSON.stringify(metadata) : null);

  // Update conversation's updated_at timestamp
  db.prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(conversationId);

  // Auto-generate title from first user message
  if (role === 'user') {
    const conversation = db.prepare('SELECT title FROM conversations WHERE id = ?').get(conversationId);
    if (conversation && (conversation.title === 'New Conversation' || !conversation.title)) {
      const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
      db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, conversationId);
    }
  }

  return { id, conversationId, role, content, metadata };
}

/**
 * Delete a conversation
 */
export function deleteConversation(conversationId, userId) {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM conversations WHERE id = ? AND user_id = ?
  `).run(conversationId, String(userId));

  return result.changes > 0;
}

/**
 * Rename a conversation
 */
export function renameConversation(conversationId, userId, title) {
  const db = getDatabase();

  const result = db.prepare(`
    UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(title, conversationId, String(userId));

  return result.changes > 0;
}

export default {
  migrateConversations,
  createConversation,
  listConversations,
  getConversation,
  addConversationMessage,
  deleteConversation,
  renameConversation
};
