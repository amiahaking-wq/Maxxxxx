/**
 * Desktop Daemon (MODE B)
 * Runs locally on the user's computer
 * Links Telegram gateway to designated local project directory
 * Can read/write local files and invoke local terminal safely
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { initDatabase, pruneSessions } from '../database/db.js';
import { migrateToV2, needsMigration } from '../database/migrate-v2.js';
import { initBot, startBot } from '../bot/telegram.js';
import logger from '../utils/logger.js';
import { executeAgentLoop } from '../agent/loop.js';
import { addMessage } from '../database/queries.js';

export class DesktopDaemon {
  constructor() {
    this.projectPath = process.env.DESKTOP_PROJECT_PATH || process.cwd();
    this.statusPort = parseInt(process.env.DESKTOP_DAEMON_PORT || '7879', 10);
    this.allowedCommands = this.parseAllowedCommands();
    this.statusServer = null;
  }

  /**
   * Initialize desktop daemon
   */
  async initialize() {
    logger.info('🖥️  Initializing DESKTOP DAEMON', {
      projectPath: this.projectPath,
      statusPort: this.statusPort,
      allowedCommands: this.allowedCommands
    });

    // Validate project path
    if (!fs.existsSync(this.projectPath)) {
      throw new Error(`Project path does not exist: ${this.projectPath}`);
    }

    // Security check
    this.validateSecurity();

    // Load desktop configuration if exists
    await this.loadDesktopConfig();

    // Initialize database
    logger.info('Initializing database');
    initDatabase();

    if (needsMigration()) {
      logger.info('Running V2 migration');
      migrateToV2();
    }

    pruneSessions();

    // Set workspace to project path
    process.env.SANDBOX_WORKSPACE = this.projectPath;
    logger.info('Workspace set to local project', { path: this.projectPath });

    // Initialize Telegram bot with desktop context
    logger.info('Initializing Telegram bot (Desktop Mode)');
    const bot = initBot();

    // Set up agent executor for desktop mode
    this.setupAgentExecutor();

    // Start status server
    await this.startStatusServer();

    // Start Telegram bot
    logger.info('Starting Telegram bot');
    await startBot(bot);

    logger.info('✅ Desktop Daemon ready', {
      monitoring: this.projectPath,
      status: `http://localhost:${this.statusPort}/status`
    });

    // Log instructions
    this.logInstructions();
  }

  /**
   * Validate security settings
   */
  validateSecurity() {
    const allowLocalExec = process.env.ALLOW_LOCAL_TERMINAL_EXEC === 'true';

    if (allowLocalExec) {
      logger.warn('⚠️  LOCAL TERMINAL EXECUTION IS ENABLED');
      logger.warn('This allows the agent to run commands on your computer');
      logger.warn('Allowed commands:', this.allowedCommands.join(', '));
    } else {
      logger.info('✅ Local terminal execution is DISABLED (safe mode)');
    }
  }

  /**
   * Parse allowed commands from environment
   */
  parseAllowedCommands() {
    const defaultCommands = ['npm', 'git', 'docker', 'node', 'python3', 'cargo'];
    const envCommands = process.env.DESKTOP_ALLOWED_COMMANDS;

    if (!envCommands) {
      return defaultCommands;
    }

    return envCommands.split(',').map(cmd => cmd.trim()).filter(Boolean);
  }

  /**
   * Load desktop configuration file (.hermesrc)
   */
  async loadDesktopConfig() {
    const configPath = path.join(this.projectPath, '.hermesrc');

    if (fs.existsSync(configPath)) {
      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);

        logger.info('Loaded desktop configuration', { config });

        // Apply configuration
        if (config.allowedCommands) {
          this.allowedCommands = config.allowedCommands;
        }

        if (config.whitelistedPaths) {
          this.whitelistedPaths = config.whitelistedPaths;
        }

        return config;
      } catch (error) {
        logger.warn('Failed to load .hermesrc', { error: error.message });
      }
    } else {
      logger.info('No .hermesrc found, using defaults');
      // Create example config
      const exampleConfig = {
        allowedCommands: this.allowedCommands,
        whitelistedPaths: [this.projectPath],
        autoCommit: false,
        notification: {
          enabled: true,
          onError: true,
          onSuccess: false
        }
      };

      try {
        fs.writeFileSync(
          configPath,
          JSON.stringify(exampleConfig, null, 2),
          'utf8'
        );
        logger.info('Created example .hermesrc configuration');
      } catch (error) {
        logger.warn('Could not create .hermesrc', { error: error.message });
      }
    }

    return null;
  }

  /**
   * Set up agent executor for desktop mode
   */
  setupAgentExecutor() {
    global.agentExecutor = async (sessionId, task) => {
      logger.info('Executing agent task (Desktop Mode)', {
        sessionId,
        task: task.substring(0, 50),
        projectPath: this.projectPath
      });

      // Add user message
      await addMessage(sessionId, 'user', task);

      // Execute agent loop with desktop context
      const results = await executeAgentLoop(task, sessionId, null, 'desktop_user', {
        mode: 'desktop',
        projectPath: this.projectPath,
        allowLocalExec: process.env.ALLOW_LOCAL_TERMINAL_EXEC === 'true',
        allowedCommands: this.allowedCommands
      });

      return results;
    };
  }

  /**
   * Start status server for monitoring
   */
  async startStatusServer() {
    const app = express();

    app.get('/status', (req, res) => {
      res.json({
        mode: 'desktop',
        status: 'running',
        projectPath: this.projectPath,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        allowLocalExec: process.env.ALLOW_LOCAL_TERMINAL_EXEC === 'true',
        allowedCommands: this.allowedCommands
      });
    });

    app.get('/health', (req, res) => {
      res.json({ status: 'healthy' });
    });

    return new Promise((resolve, reject) => {
      this.statusServer = http.createServer(app);

      this.statusServer.listen(this.statusPort, () => {
        logger.info('Status server listening', { port: this.statusPort });
        resolve();
      });

      this.statusServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.warn('Status port in use, skipping status server', { port: this.statusPort });
          resolve(); // Continue without status server
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Log instructions for user
   */
  logInstructions() {
    console.log('\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🖥️  DESKTOP DAEMON MODE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📁 Monitoring:', this.projectPath);
    console.log('📊 Status:', `http://localhost:${this.statusPort}/status`);
    console.log('💬 Use Telegram to control this project');
    console.log('');
    console.log('Security:');
    const execEnabled = process.env.ALLOW_LOCAL_TERMINAL_EXEC === 'true';
    console.log(`  Terminal Execution: ${execEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
    if (execEnabled) {
      console.log(`  Allowed Commands: ${this.allowedCommands.join(', ')}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n');
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    logger.info('Shutting down Desktop Daemon');

    if (this.statusServer) {
      await new Promise((resolve) => {
        this.statusServer.close(resolve);
      });
    }

    logger.info('✅ Desktop Daemon shut down');
  }
}

export default DesktopDaemon;
