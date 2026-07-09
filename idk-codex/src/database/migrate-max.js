/**
 * MAX Database Migration
 *
 * Creates tables for MAX orchestration system:
 * - max_tasks: Task tracking
 * - max_milestones: Milestone execution
 * - max_context_purges: Context memory purging logs
 */

import { getDatabase } from './db.js';
import logger from '../utils/logger.js';

/**
 * Run MAX database migrations
 *
 * @param {Database} db - SQLite database instance
 */
export function runMAXMigration(db = null) {
  const database = db || getDatabase();

  try {
    logger.info('Running MAX database migration');

    // Check if migrations already applied
    const tableCheck = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='max_tasks'
    `).get();

    if (tableCheck) {
      logger.info('MAX tables already exist, skipping migration');
      return;
    }

    // Create max_tasks table
    database.exec(`
      CREATE TABLE IF NOT EXISTS max_tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('planning', 'executing', 'completed', 'failed')),
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);

    logger.info('Created max_tasks table');

    // Create max_milestones table
    database.exec(`
      CREATE TABLE IF NOT EXISTS max_milestones (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_role TEXT NOT NULL CHECK(agent_role IN ('architect', 'engineer', 'devops', 'media')),
        description TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'completed', 'failed')),
        dependencies TEXT, -- JSON array of milestone IDs
        context_size INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (task_id) REFERENCES max_tasks(id) ON DELETE CASCADE
      );
    `);

    logger.info('Created max_milestones table');

    // Create max_context_purges table
    database.exec(`
      CREATE TABLE IF NOT EXISTS max_context_purges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        milestone_id TEXT NOT NULL,
        tokens_freed INTEGER NOT NULL,
        purged_at INTEGER NOT NULL,
        FOREIGN KEY (milestone_id) REFERENCES max_milestones(id) ON DELETE CASCADE
      );
    `);

    logger.info('Created max_context_purges table');

    // Create indexes for performance
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_max_tasks_session
      ON max_tasks(session_id, status);

      CREATE INDEX IF NOT EXISTS idx_max_tasks_status
      ON max_tasks(status, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_max_milestones_task
      ON max_milestones(task_id, status);

      CREATE INDEX IF NOT EXISTS idx_max_milestones_agent
      ON max_milestones(agent_role, status);

      CREATE INDEX IF NOT EXISTS idx_max_context_purges_milestone
      ON max_context_purges(milestone_id, purged_at DESC);
    `);

    logger.info('Created MAX indexes');

    logger.info('MAX database migration completed successfully');

  } catch (error) {
    logger.error('MAX database migration failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Rollback MAX migrations (for testing/development)
 *
 * @param {Database} db - SQLite database instance
 */
export function rollbackMAXMigration(db = null) {
  const database = db || getDatabase();

  try {
    logger.info('Rolling back MAX database migration');

    database.exec(`
      DROP TABLE IF EXISTS max_context_purges;
      DROP TABLE IF EXISTS max_milestones;
      DROP TABLE IF EXISTS max_tasks;
    `);

    logger.info('MAX database rollback completed');

  } catch (error) {
    logger.error('MAX database rollback failed', {
      error: error.message
    });
    throw error;
  }
}

export default {
  runMAXMigration,
  rollbackMAXMigration
};
