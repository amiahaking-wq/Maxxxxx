/**
 * Interface Router
 * Detects and initializes the correct operational mode
 * Modes: web (default), desktop, cli
 */

import logger from '../utils/logger.js';

export class InterfaceRouter {
  constructor() {
    this.mode = this.detectMode();
    this.interface = null;
  }

  /**
   * Detect which mode to run based on arguments and environment
   */
  detectMode() {
    // Check command line arguments
    const args = process.argv.slice(2);

    if (args.includes('--desktop') || args.includes('-d')) {
      return 'desktop';
    }

    if (args.includes('--cli') || args.includes('-c')) {
      return 'cli';
    }

    if (args.includes('--web') || args.includes('-w')) {
      return 'web';
    }

    // Check environment variable
    if (process.env.AGENT_MODE) {
      const mode = process.env.AGENT_MODE.toLowerCase();
      if (['web', 'desktop', 'cli'].includes(mode)) {
        return mode;
      }
    }

    // Check if running in interactive terminal (CLI mode)
    if (process.stdin.isTTY && process.stdout.isTTY && args.length > 0) {
      // If there are command arguments and we're in a TTY, assume CLI mode
      return 'cli';
    }

    // Default to web mode
    return 'web';
  }

  /**
   * Initialize the detected interface
   */
  async initialize() {
    logger.info('🚀 Initializing Interface Router', {
      mode: this.mode,
      args: process.argv.slice(2)
    });

    switch (this.mode) {
      case 'web':
        const { WebGateway } = await import('./web-gateway.js');
        this.interface = new WebGateway();
        break;

      case 'desktop':
        const { DesktopDaemon } = await import('./desktop-daemon.js');
        this.interface = new DesktopDaemon();
        break;

      case 'cli':
        const { CLITool } = await import('./cli-tool.js');
        this.interface = new CLITool();
        break;

      default:
        throw new Error(`Unknown interface mode: ${this.mode}`);
    }

    logger.info(`✅ Interface loaded: ${this.mode.toUpperCase()} mode`);

    // Initialize the interface
    await this.interface.initialize();

    return this.interface;
  }

  /**
   * Get current mode
   */
  getMode() {
    return this.mode;
  }

  /**
   * Get current interface instance
   */
  getInterface() {
    return this.interface;
  }
}

/**
 * Convenience function to initialize interface
 */
export async function initializeInterface() {
  const router = new InterfaceRouter();
  await router.initialize();
  return router;
}

export default InterfaceRouter;
