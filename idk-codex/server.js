/**
 * Main Application Entry Point
 * Supports three operational modes:
 * - WEB (default): Cloud-hosted Telegram + Web UI
 * - DESKTOP: Local daemon with Telegram control
 * - CLI: Command-line tool for direct execution
 */

import 'dotenv/config';
import { initializeInterface } from './src/interfaces/router.js';
import logger from './src/utils/logger.js';

/**
 * Main application entry point
 */
async function main() {
  try {
    // Initialize interface (auto-detects mode)
    const router = await initializeInterface();

    logger.info('✅ Application started successfully', {
      mode: router.getMode()
    });

    // Start watchdog (autonomous monitoring)
    try {
      const { default: watchdog } = await import('./src/watchdog/watchdog.js');
      watchdog.start();
    } catch (e) {
      logger.warn('Watchdog not started', { error: e.message });
    }
  } catch (error) {
    logger.error('Failed to start application', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);

  try {
    // Close database
    const { getDatabase } = await import('./src/database/db.js');
    const db = getDatabase();
    if (db) {
      db.close();
      logger.info('Database closed');
    }
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  }

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    promise
  });
  process.exit(1);
});

// Start application
main();
