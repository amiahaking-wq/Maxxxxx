import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, mkdirSync } from 'fs';
import logger from '../utils/logger.js';
import { runMigrations } from './migrate.js';
import { runMAXMigration } from './migrate-max.js';
import { migrateFixMaxTasks } from './migrate-fix-max-tasks.js';
import { migrateUserPreferences } from './migrate-user-preferences.js';
import { migrateSecurity } from './migrate-security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

/**
 * Initialize SQLite database with optimized settings for 1GB RAM
 * @returns {Database} SQLite database instance
 */
export function initDatabase() {
  if (db) {
    return db;
  }

  try {
    const dbPath = process.env.DATABASE_PATH || './data/sessions.db';
    const dbDir = dirname(dbPath);

    // Create data directory if it doesn't exist
    mkdirSync(dbDir, { recursive: true });

    logger.info(`Initializing database at ${dbPath}`);

    // Initialize database connection
    db = new Database(dbPath);

    // CRITICAL: Enable foreign keys FIRST, before ANY other operation
    db.pragma('foreign_keys = ON');

    // Set optimized pragmas for performance (WAL mode for better concurrency)
    db.pragma('journal_mode = WAL');

    // Set cache size to 16MB (negative value = KB)
    db.pragma('cache_size = -16000');

    // Store temp tables in memory
    db.pragma('temp_store = MEMORY');

    // Synchronous mode for balance between durability and performance
    db.pragma('synchronous = NORMAL');

    logger.info('Database pragmas configured', {
      foreign_keys: db.pragma('foreign_keys', { simple: true }),
      journal_mode: db.pragma('journal_mode', { simple: true }),
      cache_size: db.pragma('cache_size', { simple: true })
    });

    // Read and execute schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    logger.info('Schema applied successfully');

    // Run migrations to update existing databases
    runMigrations(db);

    // Apply MAX tables migration
    try {
      runMAXMigration(db);
      logger.info('MAX migration completed');
    } catch (error) {
      logger.error('Failed to apply MAX migration', {
        error: error.message
      });
      // Don't throw - allow app to continue
    }

    // Apply max_tasks schema fix migration
    try {
      migrateFixMaxTasks(db);
      logger.info('max_tasks schema fix migration completed');
    } catch (error) {
      logger.error('Failed to apply max_tasks schema fix migration', {
        error: error.message
      });
      // Don't throw - allow app to continue with new schema
    }

    // Apply user_preferences migration
    try {
      migrateUserPreferences(db);
      logger.info('user_preferences migration completed');
    } catch (error) {
      logger.error('Failed to apply user_preferences migration', {
        error: error.message
      });
      // Don't throw - allow app to continue
    }

    // Apply security + business profile migration (Stage 6 + Stage 8)
    try {
      migrateSecurity(db);
      logger.info('Security + business profile migration completed');
    } catch (error) {
      logger.error('Failed to apply security migration', {
        error: error.message
      });
      // Don't throw - allow app to continue
    }

    logger.info('Database initialized successfully');

    // Setup cleanup on process exit
    process.on('exit', () => {
      if (db) {
        db.close();
      }
    });

    process.on('SIGINT', () => {
      if (db) {
        db.close();
      }
      process.exit(0);
    });

    return db;
  } catch (error) {
    logger.error('Failed to initialize database', { error: error.message });
    throw error;
  }
}

/**
 * Get the database instance
 * @returns {Database} SQLite database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Prune old sessions and associated data
 * @param {number} days - Number of days to keep
 */
export function pruneSessions(days = 30) {
  try {
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const stmt = db.prepare(`
      DELETE FROM sessions
      WHERE last_activity < ? AND status = 'inactive'
    `);

    const result = stmt.run(cutoffDate.toISOString());
    logger.info(`Pruned ${result.changes} old sessions`);

    return result.changes;
  } catch (error) {
    logger.error('Failed to prune sessions', { error: error.message });
    throw error;
  }
}

export default {
  initDatabase,
  getDatabase,
  pruneSessions
};
