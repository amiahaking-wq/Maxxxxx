/**
 * Ruflo Swarm Framework Setup
 *
 * Initializes and manages the ruflo swarm integration for MAX architecture.
 * Provides non-interactive initialization suitable for Docker builds.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import logger from '../../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Global state tracking
 */
let rufloInitialized = false;
let daemonProcess = null;
let daemonRunning = false;

/**
 * Initialize ruflo framework (non-interactive for Docker)
 *
 * @returns {Promise<Object>} Initialization result
 */
export async function initializeRuflo() {
  try {
    logger.info('Initializing ruflo framework');

    // Check if ruflo is enabled
    if (process.env.RUFLO_ENABLED !== 'true') {
      logger.info('Ruflo is disabled (RUFLO_ENABLED not set to true)');
      return {
        success: true,
        enabled: false,
        message: 'Ruflo disabled via environment variable'
      };
    }

    // Check if already initialized
    if (rufloInitialized) {
      logger.debug('Ruflo already initialized');
      return {
        success: true,
        enabled: true,
        message: 'Already initialized'
      };
    }

    // Run ruflo init (non-interactive)
    try {
      const { stdout, stderr } = await execAsync('npx ruflo init --force', {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          RUFLO_AUTO_CONFIRM: 'true',
          NO_INTERACTIVE: 'true'
        },
        timeout: 30000 // 30 second timeout
      });

      if (stdout) {
        logger.debug('Ruflo init output', { stdout: stdout.trim() });
      }
      if (stderr) {
        logger.debug('Ruflo init stderr', { stderr: stderr.trim() });
      }

      rufloInitialized = true;
      logger.info('Ruflo framework initialized successfully');

      return {
        success: true,
        enabled: true,
        message: 'Ruflo initialized successfully'
      };

    } catch (error) {
      // If ruflo init fails, log but don't crash (graceful fallback)
      logger.warn('Ruflo init failed (non-critical)', {
        error: error.message,
        stderr: error.stderr
      });

      return {
        success: false,
        enabled: false,
        message: 'Ruflo init failed, continuing without ruflo',
        error: error.message
      };
    }

  } catch (error) {
    logger.error('Ruflo initialization error', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      enabled: false,
      message: 'Ruflo initialization error',
      error: error.message
    };
  }
}

/**
 * Initialize ruflo swarm with hierarchical topology
 *
 * @returns {Promise<Object>} Swarm initialization result
 */
export async function initializeSwarm() {
  try {
    logger.info('Initializing ruflo swarm');

    // Check if ruflo is enabled and initialized
    if (process.env.RUFLO_ENABLED !== 'true' || !rufloInitialized) {
      logger.debug('Ruflo not enabled or not initialized, skipping swarm init');
      return {
        success: false,
        enabled: false,
        message: 'Ruflo not enabled or not initialized'
      };
    }

    // Check if swarm is enabled
    if (process.env.RUFLO_SWARM_ENABLED !== 'true') {
      logger.info('Ruflo swarm disabled (RUFLO_SWARM_ENABLED not set to true)');
      return {
        success: true,
        enabled: false,
        message: 'Swarm disabled via environment variable'
      };
    }

    // Initialize swarm with hierarchical topology
    try {
      const { stdout, stderr } = await execAsync(
        'npx ruflo swarm init --topology hierarchical --max-agents 4 --strategy specialized',
        {
          cwd: PROJECT_ROOT,
          env: {
            ...process.env,
            RUFLO_AUTO_CONFIRM: 'true',
            NO_INTERACTIVE: 'true'
          },
          timeout: 30000
        }
      );

      if (stdout) {
        logger.debug('Ruflo swarm init output', { stdout: stdout.trim() });
      }
      if (stderr) {
        logger.debug('Ruflo swarm init stderr', { stderr: stderr.trim() });
      }

      logger.info('Ruflo swarm initialized successfully', {
        topology: 'hierarchical',
        maxAgents: 4,
        strategy: 'specialized'
      });

      return {
        success: true,
        enabled: true,
        topology: 'hierarchical',
        maxAgents: 4,
        strategy: 'specialized'
      };

    } catch (error) {
      logger.warn('Ruflo swarm init failed (non-critical)', {
        error: error.message,
        stderr: error.stderr
      });

      return {
        success: false,
        enabled: false,
        message: 'Swarm init failed, continuing without swarm',
        error: error.message
      };
    }

  } catch (error) {
    logger.error('Ruflo swarm initialization error', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      enabled: false,
      message: 'Swarm initialization error',
      error: error.message
    };
  }
}

/**
 * Start ruflo daemon in background
 *
 * @returns {Promise<Object>} Daemon start result
 */
export async function startRufloDaemon() {
  try {
    logger.info('Starting ruflo daemon');

    // Check if ruflo is enabled
    if (process.env.RUFLO_ENABLED !== 'true') {
      logger.debug('Ruflo disabled, skipping daemon start');
      return {
        success: false,
        enabled: false,
        message: 'Ruflo disabled'
      };
    }

    // Check if daemon is enabled
    if (process.env.RUFLO_DAEMON_ENABLED !== 'true') {
      logger.info('Ruflo daemon disabled (RUFLO_DAEMON_ENABLED not set to true)');
      return {
        success: true,
        enabled: false,
        message: 'Daemon disabled via environment variable'
      };
    }

    // Check if daemon is already running
    if (daemonRunning && daemonProcess) {
      logger.debug('Ruflo daemon already running');
      return {
        success: true,
        enabled: true,
        running: true,
        message: 'Daemon already running'
      };
    }

    // Start daemon process
    try {
      const port = process.env.RUFLO_DAEMON_PORT || 7878;

      daemonProcess = spawn('npx', ['ruflo', 'daemon', 'start', '--port', port], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          RUFLO_AUTO_CONFIRM: 'true',
          NO_INTERACTIVE: 'true'
        }
      });

      // Handle daemon output
      daemonProcess.stdout?.on('data', (data) => {
        logger.debug('Ruflo daemon stdout', { output: data.toString().trim() });
      });

      daemonProcess.stderr?.on('data', (data) => {
        logger.debug('Ruflo daemon stderr', { output: data.toString().trim() });
      });

      daemonProcess.on('error', (error) => {
        logger.error('Ruflo daemon error', { error: error.message });
        daemonRunning = false;
      });

      daemonProcess.on('exit', (code, signal) => {
        logger.warn('Ruflo daemon exited', { code, signal });
        daemonRunning = false;
        daemonProcess = null;
      });

      // Unref so it doesn't block process exit
      daemonProcess.unref();

      // Auto-restart daemon if it crashes unexpectedly
      daemonProcess.on('exit', (code, signal) => {
        if (code !== 0 && daemonRunning) {
          logger.warn('Ruflo daemon exited unexpectedly, restarting in 10 seconds', {
            code,
            signal
          });
          daemonRunning = false;
          setTimeout(() => {
            startRufloDaemon();
          }, 10000);
        }
      });

      daemonRunning = true;

      logger.info('Ruflo daemon started successfully', { port });

      return {
        success: true,
        enabled: true,
        running: true,
        port,
        pid: daemonProcess.pid
      };

    } catch (error) {
      logger.warn('Ruflo daemon start failed (non-critical)', {
        error: error.message
      });

      return {
        success: false,
        enabled: false,
        running: false,
        message: 'Daemon start failed',
        error: error.message
      };
    }

  } catch (error) {
    logger.error('Ruflo daemon startup error', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      enabled: false,
      running: false,
      message: 'Daemon startup error',
      error: error.message
    };
  }
}

/**
 * Stop ruflo daemon
 *
 * @returns {Promise<Object>} Daemon stop result
 */
export async function stopRufloDaemon() {
  try {
    logger.info('Stopping ruflo daemon');

    if (!daemonProcess || !daemonRunning) {
      logger.debug('Ruflo daemon not running');
      return {
        success: true,
        message: 'Daemon not running'
      };
    }

    // Send SIGTERM to daemon
    daemonProcess.kill('SIGTERM');

    // Wait for graceful shutdown
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (daemonProcess && daemonRunning) {
          logger.warn('Daemon did not stop gracefully, sending SIGKILL');
          daemonProcess.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      daemonProcess.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    daemonRunning = false;
    daemonProcess = null;

    logger.info('Ruflo daemon stopped successfully');

    return {
      success: true,
      message: 'Daemon stopped successfully'
    };

  } catch (error) {
    logger.error('Error stopping ruflo daemon', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      message: 'Error stopping daemon',
      error: error.message
    };
  }
}

/**
 * Get ruflo swarm status
 *
 * @returns {Promise<Object>} Swarm status
 */
export async function getSwarmStatus() {
  try {
    // Check if ruflo is enabled
    if (process.env.RUFLO_ENABLED !== 'true') {
      return {
        enabled: false,
        initialized: false,
        swarmEnabled: false,
        daemonRunning: false
      };
    }

    return {
      enabled: true,
      initialized: rufloInitialized,
      swarmEnabled: process.env.RUFLO_SWARM_ENABLED === 'true',
      daemonEnabled: process.env.RUFLO_DAEMON_ENABLED === 'true',
      daemonRunning,
      daemonPid: daemonProcess?.pid || null,
      configuration: {
        topology: 'hierarchical',
        maxAgents: 4,
        strategy: 'specialized'
      }
    };

  } catch (error) {
    logger.error('Error getting swarm status', {
      error: error.message,
      stack: error.stack
    });

    return {
      enabled: false,
      error: error.message
    };
  }
}

/**
 * Check if ruflo is available and ready
 *
 * @returns {boolean} True if ruflo is ready
 */
export function isRufloReady() {
  return (
    process.env.RUFLO_ENABLED === 'true' &&
    rufloInitialized &&
    (process.env.RUFLO_DAEMON_ENABLED !== 'true' || daemonRunning)
  );
}

/**
 * Graceful cleanup on process exit
 */
process.on('exit', () => {
  if (daemonProcess && daemonRunning) {
    try {
      daemonProcess.kill('SIGTERM');
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
});

export default {
  initializeRuflo,
  initializeSwarm,
  startRufloDaemon,
  stopRufloDaemon,
  getSwarmStatus,
  isRufloReady
};
