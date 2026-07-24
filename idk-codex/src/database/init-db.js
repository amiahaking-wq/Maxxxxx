import { initDatabase } from './db.js';
import logger from '../utils/logger.js';

/**
 * Initialize database script
 * Can be run standalone with: node src/database/init-db.js
 */
async function main() {
  try {
    logger.info('Starting database initialization...');
    initDatabase();
    logger.info('Database initialization complete');
    process.exit(0);
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    process.exit(1);
  }
}

main();
