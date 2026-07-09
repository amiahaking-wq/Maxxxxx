#!/usr/bin/env node

/**
 * Database Reset Script
 * Deletes existing database and creates fresh schema
 *
 * Usage:
 *   node scripts/reset-db.js
 *   npm run db:reset
 *
 * WARNING: This will delete ALL session data!
 */

import { unlinkSync, existsSync } from 'fs';
import { initDatabase } from '../src/database/db.js';
import logger from '../src/utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database path from environment or use default
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'sessions.db');

try {
  logger.info('Starting database reset', { dbPath });

  // Check if database exists
  if (existsSync(dbPath)) {
    logger.warn('Deleting existing database', { dbPath });
    unlinkSync(dbPath);
    logger.info('Database deleted successfully');
  } else {
    logger.info('No existing database found');
  }

  // Initialize fresh database with schema
  logger.info('Creating fresh database schema');
  initDatabase();

  logger.info('Database reset complete', { dbPath });
  console.log('\n✓ Database reset successfully!');
  console.log(`  Location: ${dbPath}\n`);

  process.exit(0);
} catch (error) {
  logger.error('Database reset failed', {
    error: error.message,
    stack: error.stack,
    dbPath
  });
  console.error('\n✗ Database reset failed:', error.message);
  process.exit(1);
}
