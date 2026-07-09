/**
 * Database migration script
 * Adds missing columns to existing databases and fixes schema inconsistencies
 */

import Database from 'better-sqlite3';
import logger from '../utils/logger.js';

/**
 * Migrate session_id columns from INTEGER to TEXT across all tables
 * This fixes foreign key constraint failures when web/CLI creates TEXT session IDs
 * @param {Database} db - SQLite database instance
 */
function migrateSessionIdsToText(db) {
  logger.info('Migrating session_id from INTEGER to TEXT across all tables');

  // Check if messages.session_id is still INTEGER
  const messagesInfo = db.prepare("PRAGMA table_info(messages)").all();
  const messagesSessionIdType = messagesInfo.find(col => col.name === 'session_id')?.type;

  if (messagesSessionIdType === 'INTEGER') {
    logger.info('Converting messages.session_id to TEXT');

    // SQLite doesn't support ALTER COLUMN TYPE, so we recreate tables
    db.exec(`
      -- 1. Create backup tables
      CREATE TABLE messages_backup AS SELECT * FROM messages;
      CREATE TABLE agent_runs_backup AS SELECT * FROM agent_runs;
      CREATE TABLE session_handoffs_backup AS SELECT * FROM session_handoffs;
      CREATE TABLE audit_logs_backup AS SELECT * FROM audit_logs;

      -- 2. Drop old tables (this removes foreign keys)
      DROP TABLE messages;
      DROP TABLE agent_runs;
      DROP TABLE session_handoffs;
      DROP TABLE audit_logs;

      -- 3. Recreate tables with TEXT session_id
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE agent_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        phase TEXT NOT NULL CHECK(phase IN ('plan', 'execute', 'test', 'deploy', 'monitor')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed', 'retrying')),
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE session_handoffs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        snapshot_data TEXT NOT NULL,
        token_usage_input INTEGER DEFAULT 0,
        token_usage_output INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resumed BOOLEAN DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id TEXT,
        event_type TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        risk_level TEXT CHECK(risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );

      -- 4. Restore data (INTEGER auto-converts to TEXT in SQLite)
      INSERT INTO messages SELECT * FROM messages_backup;
      INSERT INTO agent_runs SELECT * FROM agent_runs_backup;
      INSERT INTO session_handoffs SELECT * FROM session_handoffs_backup;
      INSERT INTO audit_logs SELECT * FROM audit_logs_backup;

      -- 5. Recreate indexes
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id, phase);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status, started_at);
      CREATE INDEX IF NOT EXISTS idx_session_handoffs_session ON session_handoffs(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_handoffs_created ON session_handoffs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_risk ON audit_logs(risk_level, timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(event_type, timestamp);

      -- 6. Clean up backup tables
      DROP TABLE messages_backup;
      DROP TABLE agent_runs_backup;
      DROP TABLE session_handoffs_backup;
      DROP TABLE audit_logs_backup;
    `);

    logger.info('✓ Migrated all session_id columns to TEXT');
  } else {
    logger.info('✓ session_id columns already TEXT, skipping migration');
  }
}

/**
 * Run database migrations
 * @param {Database} db - SQLite database instance
 */
export function runMigrations(db) {
  logger.info('Running database migrations...');

  try {
    // Check if platform column exists in sessions table
    const tableInfo = db.prepare("PRAGMA table_info(sessions)").all();
    const hasPlatform = tableInfo.some(col => col.name === 'platform');
    const hasTextId = tableInfo.some(col => col.name === 'id' && col.type === 'TEXT');

    if (!hasPlatform) {
      logger.info('Adding platform column to sessions table');
      db.prepare(`
        ALTER TABLE sessions
        ADD COLUMN platform TEXT DEFAULT 'telegram'
        CHECK(platform IN ('telegram', 'web', 'cli'))
      `).run();
      logger.info('✓ Added platform column');
    }

    // If id is still INTEGER, we need to recreate the table
    if (!hasTextId) {
      logger.info('Migrating sessions.id from INTEGER to TEXT');

      // Create new table with correct schema
      db.prepare(`
        CREATE TABLE sessions_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          platform TEXT DEFAULT 'telegram' CHECK(platform IN ('telegram', 'web', 'cli')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'active',
          last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
          linked_issue TEXT
        )
      `).run();

      // Copy existing data, converting INTEGER ids to TEXT
      db.prepare(`
        INSERT INTO sessions_new (id, user_id, platform, created_at, status, last_activity, linked_issue)
        SELECT
          CAST(id AS TEXT),
          CAST(user_id AS TEXT),
          COALESCE(platform, 'telegram'),
          created_at,
          status,
          last_activity,
          linked_issue
        FROM sessions
      `).run();

      // Drop old table and rename new one
      db.prepare('DROP TABLE sessions').run();
      db.prepare('ALTER TABLE sessions_new RENAME TO sessions').run();

      // Recreate indexes
      db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_linked_issue ON sessions(linked_issue)').run();

      logger.info('✓ Migrated sessions.id to TEXT');
    }

    // CRITICAL: Migrate session_id columns in all dependent tables
    migrateSessionIdsToText(db);

    logger.info('✅ Database migrations completed');
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    throw error;
  }
}

export default runMigrations;
