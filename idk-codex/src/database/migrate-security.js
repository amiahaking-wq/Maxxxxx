/**
 * Security & Business Profile Migration
 *
 * Adds tables for:
 *   Stage 6 (Security):
 *     - max_permissions         (per-user permission grants)
 *     - max_credentials         (AES-256-GCM encrypted credential vault)
 *     - max_audit_log           (every tool call logged)
 *     - max_pending_confirmations (destructive actions awaiting user approval)
 *
 *   Stage 8 (Customer Service):
 *     - max_business_profiles   (per-business agent config)
 *     - max_customer_conversations (customer chat history + escalation state)
 */

import logger from '../utils/logger.js';

export function migrateSecurity(db) {
  try {
    logger.info('Running security + business profile migration');

    // ========================================================================
    // STAGE 6 TABLES
    // ========================================================================

    db.exec(`
      CREATE TABLE IF NOT EXISTS max_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        permission TEXT NOT NULL,
        is_allowed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, permission)
      );

      CREATE TABLE IF NOT EXISTS max_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        username TEXT,
        encrypted_password TEXT,
        encrypted_api_key TEXT,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, service_name)
      );

      CREATE TABLE IF NOT EXISTS max_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        session_id TEXT,
        action_type TEXT NOT NULL,
        tool_name TEXT,
        tool_args TEXT,
        result_summary TEXT,
        was_destructive INTEGER DEFAULT 0,
        required_confirmation INTEGER DEFAULT 0,
        user_confirmed INTEGER DEFAULT 0,
        timestamp TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS max_pending_confirmations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action_description TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_args TEXT NOT NULL,
        risk_level TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_log_user
      ON max_audit_log(user_id, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_audit_log_session
      ON max_audit_log(session_id, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_pending_session
      ON max_pending_confirmations(session_id, status);

      CREATE INDEX IF NOT EXISTS idx_permissions_user
      ON max_permissions(user_id);

      CREATE INDEX IF NOT EXISTS idx_credentials_user
      ON max_credentials(user_id);
    `);

    // ========================================================================
    // STAGE 8 TABLES
    // ========================================================================

    db.exec(`
      CREATE TABLE IF NOT EXISTS max_business_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        business_name TEXT NOT NULL,
        business_type TEXT,
        agent_name TEXT DEFAULT 'MAX',
        agent_personality TEXT DEFAULT 'friendly, professional, helpful',
        language TEXT DEFAULT 'English',
        escalation_contact TEXT,
        working_hours TEXT,
        telegram_notify_id TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS max_customer_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        business_id INTEGER,
        customer_identifier TEXT NOT NULL,
        customer_name TEXT,
        channel TEXT DEFAULT 'telegram',
        conversation_history TEXT DEFAULT '[]',
        sentiment TEXT DEFAULT 'neutral',
        is_resolved INTEGER DEFAULT 0,
        escalated INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_business_profiles_user
      ON max_business_profiles(user_id, is_active);

      CREATE INDEX IF NOT EXISTS idx_customer_conversations_user
      ON max_customer_conversations(user_id, customer_identifier);

      CREATE INDEX IF NOT EXISTS idx_customer_conversations_escalated
      ON max_customer_conversations(escalated, updated_at DESC);

      -- Telegram account linking table
      -- Maps Telegram user IDs to website user IDs (Supabase UUIDs)
      CREATE TABLE IF NOT EXISTS max_telegram_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        telegram_user_id TEXT UNIQUE NOT NULL,
        telegram_username TEXT,
        linked_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_telegram_links_user
      ON max_telegram_links(user_id);

      CREATE INDEX IF NOT EXISTS idx_telegram_links_telegram
      ON max_telegram_links(telegram_user_id);

      -- Telegram linking codes (temporary, expire after 10 minutes)
      CREATE TABLE IF NOT EXISTS max_telegram_codes (
        code TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_telegram_codes_user
      ON max_telegram_codes(user_id);
    `);

    logger.info('Security + business profile migration completed');
  } catch (error) {
    logger.error('Security migration failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

export default { migrateSecurity };
