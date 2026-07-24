#!/usr/bin/env node

/**
 * MAX CLI - WebSocket Client
 * Connects to MAX agent server and displays real-time progress
 *
 * Usage:
 *   node max-cli.js "Create a REST API endpoint for user authentication"
 *   MAX_CLI_SERVER_URL=https://my-server.com node max-cli.js "task description"
 *
 * Environment Variables:
 *   MAX_CLI_SERVER_URL - Server URL (default: http://localhost:3000)
 *   MAX_CLI_API_KEY - API key for authentication (future use)
 *   MAX_CLI_SESSION_ID - Existing session to join (optional)
 */

import { io } from 'socket.io-client';
import axios from 'axios';
import chalk from 'chalk';
import { randomBytes } from 'crypto';

// Configuration
const SERVER_URL = process.env.MAX_CLI_SERVER_URL || 'http://localhost:3000';
const API_KEY = process.env.MAX_CLI_API_KEY || '';
const EXISTING_SESSION_ID = process.env.MAX_CLI_SESSION_ID || null;

/**
 * MAX CLI Client
 */
class MAXCLIClient {
  constructor(serverUrl, apiKey) {
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
    this.socket = null;
    this.sessionId = EXISTING_SESSION_ID || this.generateSessionId();
    this.connected = false;
    this.taskCompleted = false;
    this.phaseStatus = {};
  }

  /**
   * Generate a unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return `cli-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Connect to WebSocket server
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      console.log(chalk.cyan('\n🔌 Connecting to MAX Agent Server...'));
      console.log(chalk.gray(`   Server: ${this.serverUrl}`));
      console.log(chalk.gray(`   Session: ${this.sessionId}\n`));

      // Create socket connection
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling'],
        auth: {
          apiKey: this.apiKey
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      // Connection established
      this.socket.on('connect', () => {
        this.connected = true;
        console.log(chalk.green('✓ Connected to MAX Agent Server\n'));

        // Subscribe to session
        this.socket.emit('subscribe', this.sessionId);
        resolve();
      });

      // Connection error
      this.socket.on('connect_error', (error) => {
        console.error(chalk.red('✗ Connection failed:'), error.message);
        reject(error);
      });

      // Disconnection
      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        if (!this.taskCompleted) {
          console.log(chalk.yellow(`\n⚠ Disconnected: ${reason}`));
        }
      });

      // Subscription confirmation
      this.socket.on('subscribed', (data) => {
        console.log(chalk.green('✓ Subscribed to session updates\n'));
      });

      // Error handling
      this.socket.on('error', (error) => {
        console.error(chalk.red('✗ Error:'), error.message || error);
      });

      // Health check
      this.socket.on('pong', (data) => {
        // Silent health check response
      });
    });
  }

  /**
   * Subscribe to real-time events
   */
  subscribeToEvents() {
    // Progress updates
    this.socket.on('progress', (data) => {
      this.handleProgress(data);
    });

    // Message updates
    this.socket.on('message', (data) => {
      this.handleMessage(data);
    });

    // Status updates
    this.socket.on('status', (data) => {
      this.handleStatus(data);
    });
  }

  /**
   * Handle progress updates
   * @param {Object} data - Progress data
   */
  handleProgress(data) {
    const { phase, status, attempt, timestamp } = data;

    // Track phase status
    if (!this.phaseStatus[phase]) {
      this.phaseStatus[phase] = { status: 'pending', attempts: 0 };
    }

    this.phaseStatus[phase].status = status;
    if (attempt) {
      this.phaseStatus[phase].attempts = attempt;
    }

    // Display progress
    let emoji = '⏳';
    let color = chalk.yellow;

    if (status === 'success') {
      emoji = '✓';
      color = chalk.green;
    } else if (status === 'failed') {
      emoji = '✗';
      color = chalk.red;
    } else if (status === 'running') {
      emoji = '▶';
      color = chalk.cyan;
    }

    let message = color(`${emoji} Phase: ${phase.toUpperCase()} - ${status}`);

    if (attempt && attempt > 1) {
      message += chalk.gray(` (retry ${attempt})`);
    }

    console.log(message);
  }

  /**
   * Handle message updates
   * @param {Object} data - Message data
   */
  handleMessage(data) {
    const { type, content, level } = data;

    let color = chalk.white;
    let prefix = '  ';

    if (level === 'error') {
      color = chalk.red;
      prefix = '  ✗ ';
    } else if (level === 'warning') {
      color = chalk.yellow;
      prefix = '  ⚠ ';
    } else if (level === 'success') {
      color = chalk.green;
      prefix = '  ✓ ';
    } else if (level === 'info') {
      color = chalk.cyan;
      prefix = '  ℹ ';
    }

    console.log(color(`${prefix}${content}`));
  }

  /**
   * Handle status updates
   * @param {Object} data - Status data
   */
  handleStatus(data) {
    const { status, details } = data;

    if (status === 'completed') {
      this.taskCompleted = true;
      console.log(chalk.green('\n✓ Task completed successfully!\n'));

      if (details) {
        console.log(chalk.cyan('Summary:'));
        console.log(chalk.white(JSON.stringify(details, null, 2)));
      }

      this.disconnect();
    } else if (status === 'failed') {
      this.taskCompleted = true;
      console.log(chalk.red('\n✗ Task failed\n'));

      if (details && details.error) {
        console.log(chalk.red('Error:'));
        console.log(chalk.white(details.error));
      }

      this.disconnect();
    } else if (status === 'started') {
      console.log(chalk.cyan('🚀 Task execution started\n'));
    }
  }

  /**
   * Start health check ping
   */
  startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      if (this.connected && this.socket) {
        this.socket.emit('ping');
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop health check ping
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      this.socket.emit('unsubscribe', this.sessionId);
      this.socket.disconnect();
    }
    this.stopHealthCheck();
  }

  /**
   * Print banner
   */
  printBanner() {
    console.log(chalk.bold.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold.cyan('  MAX CLI - Multi-Agent eXecutor System'));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  }

  /**
   * Print usage instructions
   */
  printUsage() {
    console.log(chalk.white('\nUsage:'));
    console.log(chalk.gray('  node max-cli.js "<task description>"'));
    console.log(chalk.gray('  MAX_CLI_SERVER_URL=https://server.com node max-cli.js "task"\n'));

    console.log(chalk.white('Examples:'));
    console.log(chalk.gray('  node max-cli.js "Create a REST API endpoint"'));
    console.log(chalk.gray('  node max-cli.js "Fix the authentication bug"\n'));

    console.log(chalk.white('Environment Variables:'));
    console.log(chalk.gray('  MAX_CLI_SERVER_URL - Server URL (default: http://localhost:3000)'));
    console.log(chalk.gray('  MAX_CLI_API_KEY - API key for authentication'));
    console.log(chalk.gray('  MAX_CLI_SESSION_ID - Join existing session\n'));
  }

  /**
   * Submit task via HTTP API (v2.0 enhancement)
   * @param {string} taskDescription - Task to execute
   * @returns {Promise<Object>} Task submission result
   */
  async submitTask(taskDescription) {
    try {
      console.log(chalk.cyan('\n📤 Submitting task to MAX Agent...\n'));

      // Use CLI-specific endpoint (no auth required)
      const apiUrl = `${this.serverUrl}/api/agent/cli-task`;

      const response = await axios.post(apiUrl, {
        task: taskDescription,
        sessionId: this.sessionId,
        userId: 'cli-user',
        source: 'cli'
      }, {
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` })
        },
        timeout: 10000
      });

      if (response.data && response.data.success) {
        console.log(chalk.green('✓ Task submitted successfully'));
        console.log(chalk.gray(`   Session ID: ${response.data.sessionId}\n`));

        // Update session ID if server provided one
        if (response.data.sessionId) {
          this.sessionId = response.data.sessionId;
        }

        return response.data;
      } else {
        throw new Error(response.data?.error || 'Task submission failed');
      }

    } catch (error) {
      if (error.response) {
        // HTTP error response
        const status = error.response.status;
        const message = error.response.data?.error || error.message;

        console.error(chalk.red(`✗ HTTP ${status}:`), message);

        if (status === 401) {
          console.log(chalk.yellow('\n💡 Tip: Set MAX_CLI_API_KEY environment variable'));
        } else if (status === 404) {
          console.log(chalk.yellow('\n💡 Tip: Ensure the server is running and URL is correct'));
        }
      } else if (error.code === 'ECONNREFUSED') {
        console.error(chalk.red('✗ Connection refused'));
        console.log(chalk.yellow('\n💡 Tip: Is the MAX server running at'), chalk.cyan(this.serverUrl), '?');
      } else {
        console.error(chalk.red('✗ Task submission failed:'), error.message);
      }

      throw error;
    }
  }

  /**
   * Run CLI with task (enhanced v2.0 with direct submission)
   * @param {string} taskDescription - Task to execute
   */
  async run(taskDescription) {
    try {
      this.printBanner();

      if (!taskDescription) {
        this.printUsage();
        process.exit(0);
      }

      console.log(chalk.white('\nTask:'), chalk.cyan(taskDescription));

      // Connect to server for real-time updates
      await this.connect();

      // Subscribe to events
      this.subscribeToEvents();

      // Start health check
      this.startHealthCheck();

      // v2.0: Submit task via HTTP API
      try {
        await this.submitTask(taskDescription);

        console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.cyan('  Monitoring task execution (Ctrl+C to exit)'));
        console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

      } catch (error) {
        console.log(chalk.yellow('\n⚠ Task submission failed, but you can still monitor the session'));
        console.log(chalk.gray('   Waiting for updates...\n'));
      }

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      console.error(chalk.red('\n✗ CLI Error:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown on Ctrl+C
   */
  setupGracefulShutdown() {
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\n⚠ Interrupted by user'));
      this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log(chalk.yellow('\n\n⚠ Terminated'));
      this.disconnect();
      process.exit(0);
    });
  }
}

/**
 * Main entry point
 */
async function main() {
  // Get task description from command line arguments
  const args = process.argv.slice(2);
  const taskDescription = args.join(' ').trim();

  // Create and run CLI client
  const client = new MAXCLIClient(SERVER_URL, API_KEY);
  await client.run(taskDescription);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export default MAXCLIClient;
