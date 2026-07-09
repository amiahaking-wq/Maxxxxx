/**
 * Agent execution API routes
 * Handles task execution, cancellation, and status monitoring
 */

import express from 'express';
import os from 'os';
import logger from '../../utils/logger.js';
import { getDatabase } from '../../database/db.js';
import { executeAgentLoop } from '../../agent/loop.js';
import { setProvider } from '../../llm/adapter.js';
import { broadcastMessage } from '../websocket.js';
import { addToContext } from '../../agent/context.js';

const router = express.Router();

// Track active tasks for cancellation
const activeTasks = new Map();

/**
 * POST /api/agent/task
 * Execute a task (returns immediately, runs in background)
 */
router.post('/task', async (req, res) => {
  try {
    const { task, sessionId, userId, model } = req.body;

    logger.info('API', {
      method: 'POST',
      path: '/api/agent/task',
      body: { task: task?.substring(0, 100), sessionId, userId, model }
    });

    // Validate required fields
    if (!task) {
      return res.status(400).json({
        error: 'task is required',
        code: 'MISSING_TASK'
      });
    }

    const db = getDatabase();

    // Get or create session
    let actualSessionId = sessionId;
    if (!actualSessionId) {
      const requestUserId = userId || 'default-user';
      actualSessionId = `web_${Date.now()}_${requestUserId}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO sessions (id, user_id, platform, created_at, last_activity)
        VALUES (?, ?, ?, ?, ?)
      `).run(actualSessionId, requestUserId, 'web', now, now);
    }

    // Save user message
    db.prepare(`
      INSERT INTO messages (session_id, role, content, timestamp)
      VALUES (?, ?, ?, ?)
    `).run(actualSessionId, 'user', task, new Date().toISOString());

    logger.info('API', {
      method: 'POST',
      path: '/api/agent/task',
      status: 200,
      sessionId: actualSessionId
    });

    // Return immediately
    res.json({
      sessionId: actualSessionId,
      status: 'started'
    });

    // Execute in background
    setImmediate(async () => {
      try {
        // Mark as active
        activeTasks.set(actualSessionId, { cancelled: false });

        // Set the requested model/provider before starting the loop
        if (model) {
          try {
            setProvider(model);
            logger.info('Set provider/model for task', { sessionId: actualSessionId, model });
          } catch (providerError) {
            logger.warn('Failed to set requested model, using adapter default', {
              sessionId: actualSessionId,
              model,
              error: providerError.message
            });
          }
        }

        const results = await executeAgentLoop(task, actualSessionId, null, userId || 'default-user');

        // Build a short summary for the chat UI
        const summary = results.success
          ? `Task completed successfully.\n\nPhases: plan ${results.plan?.success ? '✓' : '✗'}, execute ${results.execute?.success ? '✓' : '✗'}, test ${results.test?.success ? '✓' : '✗'}, deploy ${results.deploy?.success ? '✓' : '✗'}, monitor ${results.monitor?.success ? '✓' : '✗'}.`
          : `Task failed: ${results.error || 'unknown error'}`;

        await addToContext(actualSessionId, 'assistant', summary);
        broadcastMessage(actualSessionId, { role: 'assistant', content: summary });

        // Remove from active tasks
        activeTasks.delete(actualSessionId);

      } catch (err) {
        logger.error('AGENT_TASK_ERROR', {
          sessionId: actualSessionId,
          error: err.message,
          stack: err.stack
        });
        activeTasks.delete(actualSessionId);
      }
    });

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'POST',
      path: '/api/agent/task',
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to start task',
      code: 'TASK_START_ERROR'
    });
  }
});

/**
 * POST /api/agent/cancel/:sessionId
 * Cancel a running task
 */
router.post('/cancel/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info('API', {
      method: 'POST',
      path: `/api/agent/cancel/${sessionId}`
    });

    const task = activeTasks.get(sessionId);

    if (task) {
      task.cancelled = true;
      logger.info('TASK_CANCELLED', { sessionId });
    }

    logger.info('API', {
      method: 'POST',
      path: `/api/agent/cancel/${sessionId}`,
      status: 200,
      wasCancelled: !!task
    });

    res.json({
      cancelled: true,
      sessionId
    });

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'POST',
      path: `/api/agent/cancel/${req.params.sessionId}`,
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to cancel task',
      code: 'TASK_CANCEL_ERROR'
    });
  }
});

/**
 * GET /api/agent/status/:sessionId
 * Get current agent status for a session
 */
router.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info('API', {
      method: 'GET',
      path: `/api/agent/status/${sessionId}`
    });

    const db = getDatabase();

    // Get latest agent run
    const latestRun = db.prepare(`
      SELECT * FROM agent_runs
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sessionId);

    // Get file modifications count
    const filesModified = db.prepare(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE session_id = ? AND role = 'assistant'
        AND content LIKE '%modified%'
    `).get(sessionId);

    // Calculate token usage (placeholder - would need actual tracking)
    const tokenUsage = {
      input: 0,
      output: 0,
      total: 0
    };

    const status = {
      phase: latestRun?.phase || 'idle',
      status: latestRun?.status || 'idle',
      startedAt: latestRun?.created_at || null,
      progress: latestRun?.progress || 0,
      filesModified: filesModified?.count || 0,
      tokenUsage
    };

    logger.info('API', {
      method: 'GET',
      path: `/api/agent/status/${sessionId}`,
      status: 200
    });

    res.json(status);

  } catch (err) {
    logger.error('API_ERROR', {
      method: 'GET',
      path: `/api/agent/status/${req.params.sessionId}`,
      error: err.message,
      stack: err.stack
    });

    res.status(500).json({
      error: 'Failed to get status',
      code: 'STATUS_FETCH_ERROR'
    });
  }
});

/**
 * GET /api/runtime
 * Get runtime information (sandbox, tunnels, processes)
 */
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

/**
 * GET /health (moved to index.js for /api/health)
 * This endpoint is now available at both /api/health and /api/agent/health
 */
router.get('/health', async (req, res) => {
  try {
    const db = getDatabase();

    // Check database
    const dbOk = !!db.prepare('SELECT 1').get();

    // Check for any configured LLM provider
    const llmOk = !!(
      process.env.GROQ_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENAI_COMPATIBLE_BASE_URL ||
      process.env.OLLAMA_HOST ||
      process.env.LOCAL_API_BASE_URL
    );

    // Check Telegram
    const telegramOk = !!process.env.TELEGRAM_BOT_TOKEN;

    const health = {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      telegram: telegramOk,
      db: dbOk,
      llm: llmOk
    };

    res.json(health);

  } catch (err) {
    logger.error('HEALTH_CHECK_ERROR', {
      error: err.message
    });

    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

export default router;
