/**
 * CLI Tool (MODE C)
 * Allows direct shell operation
 * Executes commands directly and outputs to stdout
 * Example: hermes "verify our current lockfile and build status"
 */

import readline from 'readline';
import { initDatabase } from '../database/db.js';
import logger from '../utils/logger.js';
import { executeAgentLoop } from '../agent/loop.js';
import { completion } from '../llm/adapter.js';

export class CLITool {
  constructor() {
    this.format = process.env.CLI_OUTPUT_FORMAT || 'text';
    this.verbose = process.env.CLI_VERBOSE === 'true';
    this.interactive = process.env.CLI_INTERACTIVE === 'true';
    this.rl = null;
  }

  /**
   * Initialize CLI tool
   */
  async initialize() {
    if (this.verbose) {
      logger.info('🖥️  Initializing CLI TOOL', {
        format: this.format,
        verbose: this.verbose,
        interactive: this.interactive
      });
    }

    // Initialize database (minimal setup for CLI)
    initDatabase();

    // Get command from args
    const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

    if (args.length === 0 && !this.interactive) {
      this.printUsage();
      process.exit(0);
    }

    if (this.interactive || args.length === 0) {
      // Interactive mode
      await this.runInteractive();
    } else {
      // One-shot command mode
      const command = args.join(' ');
      await this.runCommand(command);
    }
  }

  /**
   * Run a single command
   */
  async runCommand(command) {
    try {
      this.printHeader(command);

      // Execute agent loop
      const results = await executeAgentLoop(command, null, null, 'cli_user', {
        mode: 'cli',
        verbose: this.verbose,
        outputFormat: this.format
      });

      this.printResults(results);

      process.exit(0);
    } catch (error) {
      this.printError(error);
      process.exit(1);
    }
  }

  /**
   * Run interactive mode
   */
  async runInteractive() {
    console.log('\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 MAX CLI - Multi-Agent eXecutor System');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Type your commands or "exit" to quit');
    console.log('Example: analyze package.json and suggest improvements');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n');

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      const command = line.trim();

      if (!command) {
        this.rl.prompt();
        return;
      }

      if (command.toLowerCase() === 'exit' || command.toLowerCase() === 'quit') {
        console.log('Goodbye! 👋');
        this.rl.close();
        process.exit(0);
        return;
      }

      if (command === 'help') {
        this.printHelp();
        this.rl.prompt();
        return;
      }

      try {
        // Execute command
        const results = await executeAgentLoop(command, null, null, 'cli_user', {
          mode: 'cli',
          verbose: this.verbose,
          outputFormat: this.format
        });

        this.printResults(results);
      } catch (error) {
        this.printError(error);
      }

      console.log('');
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      process.exit(0);
    });
  }

  /**
   * Print command header
   */
  printHeader(command) {
    if (this.format === 'json') {
      return; // No header for JSON
    }

    console.log('\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 Executing:', command);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  }

  /**
   * Print results
   */
  printResults(results) {
    if (this.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (this.format === 'markdown') {
      console.log('## Results\n');
      if (results.phases) {
        results.phases.forEach(phase => {
          console.log(`### Phase: ${phase.name}`);
          console.log(`Status: ${phase.status}\n`);
          if (phase.output) {
            console.log(phase.output);
            console.log('');
          }
        });
      }
      return;
    }

    // Text format (default)
    if (results.phases) {
      results.phases.forEach((phase, idx) => {
        const icon = phase.status === 'success' ? '✅' : phase.status === 'failed' ? '❌' : '⏳';
        console.log(`${icon} Phase ${idx + 1}: ${phase.name}`);

        if (this.verbose && phase.output) {
          console.log(phase.output);
        }
      });
    }

    if (results.summary) {
      console.log('\n📝 Summary:');
      console.log(results.summary);
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  /**
   * Print error
   */
  printError(error) {
    if (this.format === 'json') {
      console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
      return;
    }

    console.error('\n');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Error:', error.message);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (this.verbose && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    console.error('');
  }

  /**
   * Print usage instructions
   */
  printUsage() {
    console.log(`
Usage: hermes [options] "<command>"

Options:
  --cli           Run in CLI mode (default if command provided)
  --interactive   Run in interactive mode
  --verbose       Show detailed output
  --format <fmt>  Output format: text (default), json, markdown
  --help          Show this help message

Examples:
  hermes "check package.json for issues"
  hermes "run tests and show results"
  hermes --interactive
  hermes --format json "analyze codebase"

Interactive Mode:
  hermes --interactive
  > analyze package.json
  > exit
    `);
  }

  /**
   * Print help in interactive mode
   */
  printHelp() {
    console.log(`
Available commands:
  <any text>      Execute command
  help            Show this help
  exit/quit       Exit interactive mode

Examples:
  analyze package.json and suggest improvements
  check if tests are passing
  show me recent git commits
    `);
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    if (this.rl) {
      this.rl.close();
    }
  }
}

export default CLITool;
