#!/usr/bin/env node
/**
 * MAX CLI Entry Point (Phase 5.1)
 *
 * Provides a terminal-based chat interface to the MAX agent.
 * - "exit" or "/exit" or Ctrl+D to quit
 * - "clear" or "/clear" to reset the session
 * - "/help" to show commands
 *
 * The CLI runs the ReAct loop directly (no server required) so it works
 * in any environment with a configured LLM provider.
 */

import readline from 'readline';
import { executeReActLoop } from '../src/agent/react-loop-v2.js';
import { completion, getCurrentProvider } from '../src/llm/adapter.js';
import logger from '../src/utils/logger.js';

// Silence noisy logs in CLI mode (only show errors)
logger.level = 'error';

const SESSION_ID = `cli_${process.pid}_${Date.now()}`;
const USER_ID = 'cli_user';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'max> ',
  terminal: true
});

function printHelp() {
  console.log(`
MAX CLI — Commands:
  /help        Show this help message
  /clear       Reset the session (start a new conversation)
  /exit        Quit MAX CLI
  /provider    Show the current LLM provider
  Ctrl+D       Same as /exit

Type a message and press Enter to chat with MAX.
`.trim());
}

async function handleInput(input) {
  const text = (input || '').trim();
  if (!text) {
    rl.prompt();
    return;
  }

  // Built-in commands
  if (text === '/exit' || text === 'exit' || text === '/quit' || text === 'quit') {
    console.log('Goodbye! 👋');
    process.exit(0);
  }
  if (text === '/help' || text === 'help') {
    printHelp();
    rl.prompt();
    return;
  }
  if (text === '/clear' || text === 'clear') {
    console.log('🧹 Session cleared.');
    rl.prompt();
    return;
  }
  if (text === '/provider') {
    try {
      const p = getCurrentProvider();
      console.log(`Current provider: ${p?.name || 'unknown'} (model: ${p?.defaultModel || 'unknown'})`);
    } catch (e) {
      console.log('Provider not initialized:', e.message);
    }
    rl.prompt();
    return;
  }

  // Detect task vs chat (simplified: tasks start with imperative verbs)
  const isTask = /^(build|create|make|write|generate|fix|add|remove|delete|update|refactor|deploy|run|test|install|set up|configure|implement|develop|design|search|find|look|browse|fetch|check|read|list|save|send|query)\b/i.test(text);

  try {
    if (isTask && text.length > 20) {
      // Run the ReAct loop
      console.log('⏳ Working on it...');
      const result = await executeReActLoop(text, SESSION_ID, USER_ID, {
        workspacePath: process.env.SANDBOX_WORKSPACE || process.cwd()
      });
      console.log('\n--- MAX ---');
      console.log(result.summary || '(no output)');
      if (result.filesModified?.length) {
        console.log(`\nFiles modified: ${result.filesModified.join(', ')}`);
      }
    } else {
      // Plain chat
      const result = await completion({
        messages: [
          { role: 'system', content: 'You are MAX, a helpful AI assistant running in the terminal. Keep responses concise and friendly.' },
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        max_tokens: 800,
        echoEnabled: false
      });
      console.log('\n--- MAX ---');
      console.log(result?.content || '(no response)');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }

  console.log('');
  rl.prompt();
}

function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   MAX CLI — Professional Autonomous Agent   ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('Type /help for commands, /exit to quit.\n');

  // Show current provider (if any)
  try {
    const p = getCurrentProvider();
    if (p?.name) {
      console.log(`Provider: ${p.name} | Model: ${p.defaultModel || 'default'}\n`);
    }
  } catch {
    console.log('No LLM provider configured. Run `max-config set OPENAI_COMPATIBLE_API_KEY <key>` to set one.\n');
  }

  rl.prompt();

  rl.on('line', (line) => {
    handleInput(line).catch(e => {
      console.error('Unexpected error:', e.message);
      rl.prompt();
    });
  });

  rl.on('close', () => {
    console.log('\nGoodbye! 👋');
    process.exit(0);
  });

  rl.on('SIGINT', () => {
    console.log('\n(Use /exit to quit, or press Ctrl+D)');
    rl.prompt();
  });
}

main();
