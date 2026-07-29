/**
 * Web Gateway (MODE A)
 * Optimized for remote cloud hosting (Railway)
 * Communicates via Telegram polling/webhooks
 * Sandboxes file execution inside cloud container volumes
 */

import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initDatabase, pruneSessions } from '../database/db.js';
import { migrateToV2, needsMigration } from '../database/migrate-v2.js';
import { runMAXMigration } from '../database/migrate-max.js';
import { initBot, startBot, startBotWebhook } from '../bot/telegram.js';
import { ensureSandbox } from '../utils/filesystem.js';
import { validateEnvironment } from '../security/sandbox.js';
import logger from '../utils/logger.js';
import apiRoutes from '../api/routes/index.js';
import { initWebSocket } from '../api/websocket.js';
import { executeAgentLoop } from '../agent/loop.js';
import { addMessage } from '../database/queries.js';
import { initializeRuflo, initializeSwarm, startRufloDaemon } from '../agent/max/ruflo-setup.js';
import phoneBridge from '../interfaces/phone-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebGateway {
  constructor() {
    // Railway ALWAYS provides PORT env var in production
    // 3000 fallback is ONLY for local development
    this.port = Number(process.env.PORT) || 3000;
    this.app = null;
    this.server = null;
    this.io = null;
    this.bot = null;
    this.botConnected = false;
    this.botRetryCount = 0;
    this.botRetryTimer = null;
  }

  /**
   * Initialize web gateway
   */
  async initialize() {
    logger.info('🌐 Initializing WEB GATEWAY', {
      port: this.port,
      nodeEnv: process.env.NODE_ENV
    });

    // Warn if running in production without PORT env var
    if (process.env.NODE_ENV === 'production' && !process.env.PORT) {
      logger.warn('⚠️ Running in production without PORT environment variable set. Using fallback port 3000.');
    }

    // Validate environment
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
      this.logFatalError(envValidation.errors);
      throw new Error('Environment validation failed');
    }

    // Initialize database
    logger.info('Initializing database');
    initDatabase();

    // Check for V2 migration
    if (needsMigration()) {
      logger.info('Running V2 migration');
      migrateToV2();
    }

    // Run MAX migration
    logger.info('Running MAX migration');
    runMAXMigration();

    // Prune old sessions
    pruneSessions();

    // Initialize Ruflo swarm framework (if enabled)
    // This runs after database migrations but before server start
    if (process.env.RUFLO_ENABLED === 'true') {
      logger.info('Initializing Ruflo swarm framework');

      try {
        // Step 1: Initialize ruflo
        const rufloInit = await initializeRuflo();
        if (rufloInit.success && rufloInit.enabled) {
          logger.info('Ruflo framework initialized', {
            message: rufloInit.message
          });

          // Step 2: Initialize swarm topology
          const swarmInit = await initializeSwarm();
          if (swarmInit.success && swarmInit.enabled) {
            logger.info('Ruflo swarm initialized', {
              topology: swarmInit.topology,
              maxAgents: swarmInit.maxAgents,
              strategy: swarmInit.strategy
            });
          } else {
            logger.warn('Ruflo swarm initialization skipped', {
              reason: swarmInit.message
            });
          }

          // Step 3: Start daemon (if enabled)
          if (process.env.RUFLO_DAEMON_ENABLED === 'true') {
            const daemonStart = await startRufloDaemon();
            if (daemonStart.success && daemonStart.running) {
              logger.info('Ruflo daemon started', {
                port: daemonStart.port,
                pid: daemonStart.pid
              });
            } else {
              logger.warn('Ruflo daemon start skipped or failed', {
                reason: daemonStart.message
              });
            }
          }
        } else {
          logger.warn('Ruflo initialization skipped or failed', {
            reason: rufloInit.message
          });
        }
      } catch (error) {
        // Graceful fallback: Log error but continue startup
        logger.error('Ruflo initialization error (continuing without ruflo)', {
          error: error.message,
          stack: error.stack
        });
      }
    } else {
      logger.debug('Ruflo disabled (RUFLO_ENABLED not set to true)');
    }

    // Ensure sandbox exists
    await ensureSandbox();

    // Create Express app
    this.createExpressApp();

    // Initialize Telegram bot (if configured)
    if (process.env.TELEGRAM_BOT_TOKEN) {
      logger.info('Initializing Telegram bot');
      try {
        this.bot = initBot();
        global.botStatus = 'initialized';
        logger.info('✅ Bot instance created successfully');
      } catch (error) {
        logger.error('❌ Failed to create bot instance', {
          error: error.message,
          hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
          tokenLength: process.env.TELEGRAM_BOT_TOKEN?.length || 0
        });
        global.botStatus = 'init_failed';
        // Don't throw - allow server to start without bot
        this.bot = null;
      }
    } else {
      logger.warn('⚠️  Telegram bot disabled - TELEGRAM_BOT_TOKEN not set');
      global.botStatus = 'disabled';
      this.bot = null;
    }

    // Start server FIRST (non-blocking)
    await this.startServer();

    // Attempt bot start in background (non-blocking, if bot initialized)
    if (this.bot) {
      logger.info('Attempting Telegram bot connection in background');
      this.attemptBotStart();
    } else {
      logger.info('Telegram bot not initialized - skipping connection attempt');
    }

    // Monitor memory usage for Railway deployment
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        const usage = process.memoryUsage();
        logger.info('Memory usage', {
          heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
          rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
          external: Math.round(usage.external / 1024 / 1024) + 'MB'
        });
      }, 300000); // Every 5 minutes
    }
    // Railway self-ping to prevent idle timeout
    const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN;
    if (RAILWAY_URL) {
      setInterval(async () => {
        try {
          const url = `https://${RAILWAY_URL}/health`;
          await fetch(url);
          logger.debug('Self-ping successful');
        } catch (e) {
          logger.debug('Self-ping failed', { error: e.message });
        }
      }, 4 * 60 * 1000); // Every 4 minutes
    }


    logger.info('✅ Web Gateway ready (Telegram bot connecting in background)');
  }

  /**
   * Create Express application with WebSocket support
   */
  createExpressApp() {
    this.app = express();
    this.server = http.createServer(this.app);

    // Initialize phone WebSocket bridge (no-op if PHONE_SECRET is not set)
    try {
      if (process.env.PHONE_SECRET) {
        phoneBridge.initialize(this.server);
      }
    } catch (error) {
      logger.warn('Failed to initialize phone bridge', { error: error.message });
    }

    // Configure Socket.IO with extended ping timeout to prevent Railway transport close errors
    this.io = new SocketIO(this.server, {
      cors: {
        origin: process.env.WEB_UI_ORIGIN || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        credentials: false
      },
      pingTimeout: 300000,   // 5 min — client has 5 min to respond (slow CPU/phone)
      pingInterval: 120000,  // ping every 2 min — less frequent = less overhead
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      maxHttpBufferSize: 1e8
    });

    // Middleware — CORS allows all origins (frontend is separate service)
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
      credentials: false
    }));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // API routes
    this.app.use('/api', apiRoutes);

    // Health check endpoint for Railway keep-alive
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Telegram webhook route (if webhook mode enabled)
    if (process.env.TELEGRAM_WEBHOOK_URL && process.env.TELEGRAM_BOT_TOKEN) {
      const webhookPath = process.env.TELEGRAM_WEBHOOK_PATH || '/api/telegram/webhook';

      logger.info('Setting up Telegram webhook route', { path: webhookPath });

      // This route will be used when bot is in webhook mode
      this.app.post(webhookPath, async (req, res) => {
        if (!this.bot) {
          res.sendStatus(503); // Service unavailable
          return;
        }

        try {
          await this.bot.handleUpdate(req.body);
          res.sendStatus(200);
        } catch (error) {
          logger.error('Webhook handler error', { error: error.message });
          res.sendStatus(500);
        }
      });

      logger.info('✅ Telegram webhook route registered', { path: webhookPath });
    }

    // Serve frontend static files IF they exist (backward compat for single-service deploys)
    // When frontend is a separate Railway service, this path won't exist — that's fine.
    const frontendDistPath = path.resolve(path.dirname(__dirname), '..', '..', 'app', 'dist');

    if (fs.existsSync(frontendDistPath)) {
      logger.info('Frontend dist path configured', { frontendDistPath, exists: true });
      this.app.use(express.static(frontendDistPath));
      // SPA fallback
      this.app.get(/^(?!\/socket\.io\/|\/api\/).*$/, (req, res) => {
        const indexPath = path.resolve(frontendDistPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).json({ error: 'Not found', hint: 'This is an API-only service. Frontend is deployed separately.' });
        }
      });
    } else {
      logger.info('Frontend dist not found — running as API-only service');
      // API-only: return a clear "this is an API" response for non-API routes
      this.app.get('/', (req, res) => {
        res.json({
          service: 'MAX API',
          status: 'running',
          message: 'This is the MAX backend API. The frontend is deployed separately.',
          docs: '/api/health',
          endpoints: {
            auth: '/api/auth/*',
            conversations: '/api/conversations/*',
            vault: '/api/vault/*',
            knowledge: '/api/knowledge/*',
            sandbox: '/api/sandbox/*',
            usage: '/api/usage/*',
            scheduled: '/api/scheduled/*',
            teams: '/api/teams/*',
            health: '/api/health'
          }
        });
      });
      // For all other non-API, non-socket.io routes — return 403 (not a website)
      this.app.get(/^(?!\/socket\.io\/|\/api\/).*$/, (req, res) => {
        res.status(403).json({
          error: 'Authorization not allowed',
          message: 'This is an API-only service. Frontend routes are not served here.',
          hint: 'Visit the frontend URL (separate Railway service) to use the MAX UI.'
        });
      });
    }

    // Initialize WebSocket
    initWebSocket(this.io);

    // ===== VISION SUPPORT (Phase 6.1) =====
    // Helper that builds a vision-capable user message when images are
    // attached to a prompt. Used by /api/conversations/:id/messages and
    // the global agentExecutor below so the agent can SEE uploaded images.
    global.buildVisionMessage = function (prompt, images = []) {
      if (!images || images.length === 0) {
        return prompt; // plain text — no vision needed
      }
      const content = [{ type: 'text', text: prompt || '' }];
      for (const img of images) {
        if (!img) continue;
        // Accept data URLs, http(s) URLs, or raw base64 strings
        const url = typeof img === 'string'
          ? (img.startsWith('data:') || img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`)
          : (img.url || (img.data ? `data:${img.mimeType || 'image/jpeg'};base64,${img.data}` : ''));
        if (url) {
          content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
        }
      }
      return content; // array form — OpenAI vision format
    };

    // Make agent executor available globally for API
    global.agentExecutor = async (sessionId, task, options = {}) => {
      logger.info('Executing agent task via API', { sessionId, task: task.substring(0, 50) });

      // Add user message to database
      await addMessage(sessionId, 'user', task);

      // Phase 6.1 — if images are attached, build a vision message and
      // inject it into the task so the agent loop sees the image.
      let effectiveTask = task;
      if (options.images && options.images.length > 0) {
        // The ReAct loop expects a string prompt; embed the image URLs as
        // markdown image tags so the LLM can fetch them via read_upload.
        // The vision-capable chat path already builds a proper vision
        // message via global.buildVisionMessage; this is the agent path
        // fallback.
        const imageList = options.images
          .map((img, i) => `[Image ${i + 1}: ${typeof img === 'string' ? img.slice(0, 50) + '...' : 'attached'}]`)
          .join('\n');
        effectiveTask = `${task}\n\n[User attached ${options.images.length} image(s). Use read_upload to inspect them.]\n${imageList}`;
      }

      // Execute agent loop
      const results = await executeAgentLoop(effectiveTask, sessionId, null, 'web_user');

      return results;
    };

    logger.info('Express app created with WebSocket support');
  }

  /**
   * Start HTTP server
   */
  async startServer() {
    return new Promise((resolve, reject) => {
      // Bind to 0.0.0.0 for Railway compatibility (allows external access)
      const host = process.env.HOST || '0.0.0.0';

      this.server.listen(this.port, host, () => {
        logger.info('🚀 Web Gateway listening', {
          host,
          port: this.port,
          webUI: `http://${host}:${this.port}`,
          api: `http://${host}:${this.port}/api`
        });
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('Server error', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Attempt to start Telegram bot (polling or webhook mode)
   */
  async attemptBotStart() {
    if (!this.bot) {
      logger.warn('Bot instance not available, skipping start attempt');
      return;
    }

    // Calculate retry delay
    let retryDelay = 0;
    if (this.botRetryCount > 0) {
      if (this.botRetryCount <= 5) {
        retryDelay = 5000 * Math.pow(3, this.botRetryCount - 1);
      } else {
        retryDelay = 5 * 60 * 1000;
      }

      logger.info('Waiting before bot launch attempt', {
        attempt: this.botRetryCount + 1,
        retryDelay
      });

      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    this.botRetryCount++;

    // Determine mode: webhook if URL set, otherwise polling
    const useWebhook = !!process.env.TELEGRAM_WEBHOOK_URL;
    let result;

    if (useWebhook) {
      logger.info('Starting bot in WEBHOOK mode');
      result = await startBotWebhook(this.bot, {
        webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
        path: process.env.TELEGRAM_WEBHOOK_PATH || '/api/telegram/webhook',
        port: this.port
      });
    } else {
      logger.info('Starting bot in POLLING mode');
      result = await startBot(this.bot, { retryDelay });
    }

    if (result.success) {
      this.botConnected = true;
      global.botStatus = 'connected';
      logger.info('✅ Telegram bot connected successfully', {
        mode: result.mode || 'polling',
        attempt: this.botRetryCount
      });
    } else if (result.retryable) {
      const nextRetryDelay = this.botRetryCount <= 5
        ? 5000 * Math.pow(3, this.botRetryCount)
        : 5 * 60 * 1000;

      global.botStatus = 'reconnecting';
      logger.info('Scheduling bot reconnection attempt', {
        attempt: this.botRetryCount,
        nextRetryIn: `${nextRetryDelay / 1000}s`,
        reason: result.error?.message || 'Unknown error'
      });

      this.botRetryTimer = setTimeout(() => {
        this.attemptBotStart();
      }, nextRetryDelay);
    } else {
      global.botStatus = 'failed';
      logger.error('❌ Bot startup failed with non-retryable error', {
        error: result.error?.message,
        code: result.code
      });
    }
  }

  /**
   * Log fatal error with formatting
   */
  logFatalError(errors) {
    logger.error('[FATAL] WEB GATEWAY STARTUP FAILED', {
      reason: 'Missing required environment variables',
      errors
    });
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    logger.info('Shutting down Web Gateway');

    // Clear bot retry timer if active
    if (this.botRetryTimer) {
      clearTimeout(this.botRetryTimer);
      this.botRetryTimer = null;
      logger.info('Cleared bot retry timer');
    }

    // Stop bot if connected
    if (this.bot && this.botConnected) {
      try {
        logger.info('Stopping Telegram bot');
        await this.bot.stop();
        logger.info('Telegram bot stopped');
      } catch (error) {
        logger.warn('Error stopping bot during shutdown', {
          error: error.message
        });
      }
    }

    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }

    if (this.io) {
      this.io.close();
    }

    logger.info('✅ Web Gateway shut down');
  }
}

export default WebGateway;
