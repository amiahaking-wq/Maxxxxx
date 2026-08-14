/**
 * API routes aggregator
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
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
import extrasRouter from './extras.js';
import authRouter from './auth.js';
import vaultRouter from './vault.js';
import knowledgeRouter from './knowledge.js';
import usageRouter from './usage.js';
import billingRouter from './billing.js';
import teamsRouter from './teams.js';
import memoryLongTermRouter from './memory-long-term.js';
import suggestionsRouter from './suggestions.js';
import sandboxRouter from './sandbox.js';
import scheduledRouter from './scheduled.js';
import sharedRouter from './shared.js';
import gptsRouter from './gpts.js';

// Re-export validation utilities (Phase 3.9) so callers can import them
// from a single entry point.
export { chatSchema, validateBody } from '../middleware/validation.js';

const router = Router();

// ============================================================================
// RATE LIMITERS (Phase 3.3)
// ============================================================================

/**
 * General API limiter — 100 requests per 15 min per IP.
 * Applied to lower-risk routes (sandbox, teams, scheduled).
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes.'
  }
});

/**
 * Chat limiter — 10 requests per minute per IP.
 * Applied to conversation/message POST routes (LLM calls are expensive).
 */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many chat requests. Please slow down (max 10 per minute).'
  }
});

// Expose limiters so other code can reuse them
router.apiLimiter = apiLimiter;
router.chatLimiter = chatLimiter;

// ============================================================================
// INPUT VALIDATION (Phase 3.9 — zod schemas)
// ============================================================================
const chatSchema = z.object({
  message: z.string().min(1).max(50000),
  files: z.array(z.object({})).optional(),
  images: z.array(z.string()).optional(),
  runAgent: z.boolean().optional(),
  model: z.string().optional()
});

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e) {
      res.status(400).json({ error: 'Invalid request body', details: e.errors || e.message });
    }
  };
}

router.validateBody = validateBody;
router.chatSchema = chatSchema;

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
// Apply chatLimiter to all conversation POST routes (Phase 3.3)
router.use('/conversations', chatLimiter, conversationsRouter);
router.use('/connectors', connectorsRouter);
router.use('/upload', uploadRouter);
router.use('/permissions', permissionsRouter);
router.use('/cs', csRouter);
router.use('/auth', authRouter);
router.use('/vault', vaultRouter);
router.use('/knowledge', knowledgeRouter);
router.use('/usage', usageRouter);
router.use('/billing', billingRouter);
// Apply apiLimiter (100 req / 15 min) to teams routes (Phase 3.3)
router.use('/teams', apiLimiter, teamsRouter);
router.use('/memory-long-term', memoryLongTermRouter);  // adds /summarize/:id and /long-term
router.use('/suggestions', suggestionsRouter);
// Apply apiLimiter to sandbox + scheduled (Phase 3.3)
router.use('/sandbox', apiLimiter, sandboxRouter);
router.use('/scheduled', apiLimiter, scheduledRouter);
router.use('/shared', sharedRouter);
router.use('/gpts', gptsRouter);
router.use('/', extrasRouter);  // memory + user profile routes
router.use('/files/download', uploadRouter);

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
