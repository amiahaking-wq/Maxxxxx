/**
 * Migration: Add user_preferences table
 * Stores user configuration like preferred model and repository
 */

import logger from '../utils/logger.js';

export function migrateUserPreferences(db) {
  try {
    logger.info('Running user_preferences migration...');

    // Check if table already exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='user_preferences'
    `).get();

    if (tableExists) {
      logger.info('user_preferences table already exists, skipping migration');
      return;
    }

    // Create user_preferences table
    db.exec(`
      CREATE TABLE user_preferences (
        user_id TEXT PRIMARY KEY,
        repo_owner TEXT,
        repo_name TEXT,
        preferred_model TEXT DEFAULT 'groq-llama-70b',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Index for faster lookups
      CREATE INDEX IF NOT EXISTS idx_user_prefs_user
        ON user_preferences(user_id);
    `);

    logger.info('user_preferences migration completed successfully');

  } catch (error) {
    logger.error('Failed to apply user_preferences migration', {
      error: error.message,
      stack: error.stack
    });
    // Don't throw - allow app to continue
  }
}
