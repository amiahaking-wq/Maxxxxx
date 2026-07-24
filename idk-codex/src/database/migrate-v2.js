/**
 * V2 Enhancement: Database Migration
 * Purpose: Add session_handoffs, error_patterns, and audit_logs tables for V2 features
 * Integration Point: Called from server.js during startup
 */

import { getDatabase } from './db.js';
import logger from '../utils/logger.js';

/**
 * Run V2 database migration
 * Adds tables for session handoffs, error pattern learning, and audit logging
 * @returns {boolean} True if migration succeeded
 */
export function migrateToV2() {
  const db = getDatabase();

  try {
    logger.info('Starting V2 database migration');

    // Begin transaction for atomic migration
    db.exec('BEGIN TRANSACTION');

    // Session handoffs table: Stores handoff snapshots for session continuity
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_handoffs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        snapshot_data TEXT NOT NULL,
        token_usage_input INTEGER DEFAULT 0,
        token_usage_output INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resumed BOOLEAN DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    // Error patterns table: Stores learned error signatures and fixes
    db.exec(`
      CREATE TABLE IF NOT EXISTS error_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_signature TEXT NOT NULL UNIQUE,
        error_type TEXT NOT NULL,
        fix_description TEXT NOT NULL,
        success_count INTEGER DEFAULT 1,
        last_success_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Audit logs table: Tracks security-relevant operations
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id INTEGER,
        event_type TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        risk_level TEXT CHECK(risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );
    `);

    // Create indexes for better query performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_handoffs_session ON session_handoffs(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_handoffs_created ON session_handoffs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_error_patterns_signature ON error_patterns(error_signature);
      CREATE INDEX IF NOT EXISTS idx_error_patterns_type ON error_patterns(error_type);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_risk ON audit_logs(risk_level, timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(event_type, timestamp);
    `);

    // Commit transaction
    db.exec('COMMIT');

    logger.info('V2 database migration completed successfully');
    return true;
  } catch (error) {
    // Rollback on error
    try {
      db.exec('ROLLBACK');
      logger.warn('V2 database migration rolled back');
    } catch (rollbackError) {
      logger.error('Failed to rollback migration', { error: rollbackError.message });
    }
    logger.error('V2 database migration failed', { error: error.message });
    throw error;
  }
}

/**
 * Check if V2 migration is needed
 * @returns {boolean} True if migration needed
 */
export function needsMigration() {
  try {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='session_handoffs'
    `).get();

    return !result;
  } catch (error) {
    logger.error('Failed to check migration status', { error: error.message });
    return true;
  }
}

export default {
  migrateToV2,
  needsMigration
};
