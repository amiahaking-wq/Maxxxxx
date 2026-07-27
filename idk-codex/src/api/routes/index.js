/**
 * API routes aggregator
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import sessionsRouter from './sessions.js';
import messagesRouter from './messages.js';
import agentRouter from './agent.js';
import filesRouter from './files.js';
import maxRouter from './max.js';
import configRouter from './config.js';
import reposRouter from './repos.js';
import conversationsRouter from './conversations.js';
import connectorsRouter from './connectors.js';
import uploadRouter from './upload.js';
import permissionsRouter from './permissions.js';
import csRouter from './cs.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    telegram: global.botStatus || 'unknown'
  });
});

// Debug route to check frontend dist
router.get('/debug/frontend', (req, res) => {
  const distPath = path.join(process.cwd(), 'frontend', 'dist');
  const distExists = fs.existsSync(distPath);
  const indexExists = distExists && fs.existsSync(path.join(distPath, 'index.html'));

  res.json({
    distPath,
    distExists,
    indexExists,
    cwd: process.cwd(),
    files: distExists ? fs.readdirSync(distPath) : []
  });
});

// Mount route modules
router.use('/sessions', sessionsRouter);
router.use('/messages', messagesRouter);
router.use('/agent', agentRouter);
router.use('/files', filesRouter);
router.use('/max', maxRouter);
router.use('/config', configRouter);
router.use('/repos', reposRouter);
router.use('/conversations', conversationsRouter);
router.use('/connectors', connectorsRouter);
router.use('/upload', uploadRouter);
router.use('/permissions', permissionsRouter);
router.use('/cs', csRouter);
router.use('/files/download', uploadRouter); // mount download at /api/files/download too

// Expose runtime endpoint at /api/runtime (from agent router)
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';
import os from 'os';

router.get('/runtime', async (req, res) => {
  try {
    logger.info('API', {
      method: 'GET',
      path: '/api/runtime'
    });

    // Calculate uptime
    const uptime = process.uptime();

    // Get memory usage
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const usedMem = memUsage.heapUsed;

    // Get CPU usage (simple approximation)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000 / uptime) * 100;

    // TODO: Get actual tunnel and process info from runtime tracking
    const tunnels = [];
    const processes = [];

    const runtime = {
      uptime: Math.floor(uptime),
      cpu: Math.min(cpuPercent, 100).toFixed(1),
      memory: {
        used: (usedMem / 1024 / 1024 / 1024).toFixed(2),
        total: (totalMem / 1024 / 1024 / 1024).toFixed(2)
      },
      workspace: 0, // TODO: Calculate workspace size
      tunnels,
      processes,
      telegramBot: !!process.env.TELEGRAM_BOT_TOKEN,
      phoneBridge: !!process.env.PHONE_BRIDGE_ENABLED
    };

    logger.info('API', {
      method: 'GET',
      path: '/api/runtime',
      status: 200
    });

    res.json(runtime);

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'GET',
      path: '/api/runtime',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to get runtime info',
      code: 'RUNTIME_FETCH_ERROR'
    });
  }
});

export default router;
