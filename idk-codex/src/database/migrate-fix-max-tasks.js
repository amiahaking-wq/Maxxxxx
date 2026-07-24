/**
 * Migration to fix max_tasks.session_id type mismatch
 * Changes session_id from INTEGER to TEXT to match sessions.id
 */

import Database from 'better-sqlite3';
import logger from '../utils/logger.js';

/**
 * Apply migration to fix max_tasks schema
 * @param {Database} db - Database instance
 */
export function migrateFixMaxTasks(db) {
  try {
    logger.info('Starting max_tasks schema migration');

    // Check if max_tasks table exists
    const tableExists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='max_tasks'`)
      .get();

    if (!tableExists) {
      logger.info('max_tasks table does not exist, skipping migration');
      return;
    }

    // Check if session_id is already TEXT
    const tableInfo = db.prepare("PRAGMA table_info(max_tasks)").all();
    const sessionIdType = tableInfo.find(col => col.name === 'session_id')?.type;

    if (sessionIdType === 'TEXT') {
      logger.info('max_tasks.session_id already TEXT, skipping migration');
      return;
    }

    logger.info('Converting max_tasks.session_id from INTEGER to TEXT');

    // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
    db.transaction(() => {
      // Create backup of existing data
      db.prepare(`
        CREATE TABLE IF NOT EXISTS max_tasks_backup AS
        SELECT * FROM max_tasks
      `).run();

      logger.info('Created backup of max_tasks table');

      // Drop old table
      db.prepare('DROP TABLE IF EXISTS max_tasks').run();

      // Create new table with correct schema
      db.prepare(`
        CREATE TABLE IF NOT EXISTS max_tasks (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('planning', 'executing', 'completed', 'failed')),
          created_at INTEGER NOT NULL,
          completed_at INTEGER,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `).run();

      logger.info('Created new max_tasks table with TEXT session_id');

      // Restore data (only valid entries with matching session_id)
      const restoreResult = db.prepare(`
        INSERT INTO max_tasks (id, session_id, description, status, created_at, completed_at)
        SELECT id, session_id, description, status, created_at, completed_at
        FROM max_tasks_backup
        WHERE session_id IN (SELECT id FROM sessions)
      `).run();

      logger.info('Restored valid max_tasks data', { rowsRestored: restoreResult.changes });

      // Drop backup table
      db.prepare('DROP TABLE IF EXISTS max_tasks_backup').run();

      logger.info('max_tasks schema migration completed successfully');
    })();

  } catch (error) {
    logger.error('max_tasks migration failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export default {
  migrateFixMaxTasks
};
