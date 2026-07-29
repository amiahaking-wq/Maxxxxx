/**
 * Main Application Entry Point
 * Supports three operational modes:
 * - WEB (default): Cloud-hosted Telegram + Web UI
 * - DESKTOP: Local daemon with Telegram control
 * - CLI: Command-line tool for direct execution
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initializeInterface } from './src/interfaces/router.js';
import logger from './src/utils/logger.js';

// ============================================================================
// LOAD USER CONFIG (Phase 5.6) — ~/.max/config.json
// Apply values to process.env ONLY if not already set in the environment.
// This lets users store API keys and other settings in a config file instead
// of managing env vars.
// ============================================================================
function loadUserConfig() {
  try {
    const configPath = path.join(os.homedir(), '.max', 'config.json');
    if (!fs.existsSync(configPath)) return;
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    let applied = 0;
    for (const [key, value] of Object.entries(config)) {
      if (process.env[key] === undefined && value !== undefined && value !== null) {
        process.env[key] = String(value);
        applied++;
      }
    }
    if (applied > 0) {
      logger.info(`Loaded ${applied} config value(s) from ~/.max/config.json`);
    }
  } catch (e) {
    logger.debug('No ~/.max/config.json loaded', { error: e.message });
  }
}

loadUserConfig();

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

    // Start task scheduler (Phase 5 — node-cron scheduled tasks)
    try {
      const { taskScheduler } = await import('./src/scheduler/task-scheduler.js');
      taskScheduler.start();
      logger.info('Task scheduler started (Phase 5)');
    } catch (e) {
      logger.warn('Task scheduler not started', { error: e.message });
    }

    // Phase 10 — serve Next.js static files in production (if available)
    // The Next.js frontend runs as a separate Railway service, but if
    // max-frontend/.next exists, serve it from the backend too (single-service mode).
    if (process.env.NODE_ENV === 'production') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const nextDir = path.join(process.cwd(), 'max-frontend', '.next');
        const nextStatic = path.join(nextDir, 'static');
        if (fs.existsSync(nextDir)) {
          const { default: express } = await import('express');
          // Will be wired into the gateway later — for now just log availability
          logger.info('Next.js build detected — single-service mode available', { nextDir });
        }
      } catch (e) {
        logger.debug('Next.js static serving not configured', { error: e.message });
      }
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
