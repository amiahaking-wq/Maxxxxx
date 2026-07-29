#!/usr/bin/env node
/**
 * MAX Config CLI (Phase 5.5)
 *
 * Reads and writes ~/.max/config.json. The server loads this file at startup
 * and applies its values to process.env (only if not already set).
 *
 * Usage:
 *   max-config set <key> <value>   Set a config value
 *   max-config get <key>           Get a config value
 *   max-config list                List all config values
 *   max-config delete <key>        Delete a config value
 *   max-config path                Print the config file path
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

function configDir() {
  return path.join(os.homedir(), '.max');
}

function configPath() {
  return path.join(configDir(), 'config.json');
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(config) {
  const dir = configDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8');
  // Restrict to the user
  try { fs.chmodSync(configPath(), 0o600); } catch { /* best-effort */ }
}

function usage() {
  console.log(`
MAX Config — manage ~/.max/config.json

Usage:
  max-config set <key> <value>   Set a config value
  max-config get <key>           Get a config value
  max-config list                List all config values
  max-config delete <key>        Delete a config value
  max-config path                Print the config file path

The config file is loaded at server startup and its values are applied
to process.env (only if not already set in the environment).

Common keys:
  OPENAI_COMPATIBLE_API_KEY      OpenRouter / OpenAI-compatible API key
  OPENAI_COMPATIBLE_BASE_URL     Base URL (default: https://openrouter.ai/api/v1)
  OPENAI_COMPATIBLE_MODEL        Model ID (default: openrouter/auto)
  GROQ_API_KEY                   Groq API key
  ANTHROPIC_API_KEY              Anthropic API key
  OLLAMA_HOST                    Ollama host (e.g. http://localhost:11434)
  OLLAMA_MODEL                   Ollama model (e.g. llama3.2)
  TELEGRAM_BOT_TOKEN             Telegram bot token
  SUPABASE_URL                   Supabase project URL
  SUPABASE_KEY                   Supabase anon/service key
  FRONTEND_URL                   Public frontend URL (for share links)
`.trim());
}

function main() {
  const [, , cmd, key, ...rest] = process.argv;

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    process.exit(0);
  }

  if (cmd === 'path') {
    console.log(configPath());
    process.exit(0);
  }

  if (cmd === 'list') {
    const config = readConfig();
    const keys = Object.keys(config);
    if (keys.length === 0) {
      console.log('(empty config — use `max-config set <key> <value>` to add values)');
      console.log(`Path: ${configPath()}`);
      process.exit(0);
    }
    console.log(`Config at ${configPath()}:`);
    for (const k of keys) {
      const v = config[k];
      // Mask values that look like secrets
      const display = (/(key|token|secret|password)/i.test(k) && typeof v === 'string' && v.length > 8)
        ? v.slice(0, 4) + '...' + v.slice(-4)
        : v;
      console.log(`  ${k} = ${display}`);
    }
    process.exit(0);
  }

  if (cmd === 'get') {
    if (!key) {
      console.error('Error: key is required. Usage: max-config get <key>');
      process.exit(1);
    }
    const config = readConfig();
    if (!(key in config)) {
      console.error(`Key "${key}" is not set.`);
      process.exit(1);
    }
    console.log(config[key]);
    process.exit(0);
  }

  if (cmd === 'set') {
    if (!key) {
      console.error('Error: key is required. Usage: max-config set <key> <value>');
      process.exit(1);
    }
    const value = rest.join(' ');
    if (!value) {
      console.error('Error: value is required. Usage: max-config set <key> <value>');
      process.exit(1);
    }
    const config = readConfig();
    // Try to parse as JSON for booleans/numbers; otherwise keep as string
    let parsed = value;
    try {
      parsed = JSON.parse(value);
    } catch { /* keep as string */ }
    config[key] = parsed;
    writeConfig(config);
    console.log(`Set ${key} = ${(typeof parsed === 'string' && /key|token|secret|password/i.test(key)) ? value.slice(0, 4) + '...' + value.slice(-4) : parsed}`);
    process.exit(0);
  }

  if (cmd === 'delete' || cmd === 'rm' || cmd === 'unset') {
    if (!key) {
      console.error('Error: key is required. Usage: max-config delete <key>');
      process.exit(1);
    }
    const config = readConfig();
    if (!(key in config)) {
      console.error(`Key "${key}" is not set.`);
      process.exit(1);
    }
    delete config[key];
    writeConfig(config);
    console.log(`Deleted ${key}`);
    process.exit(0);
  }

  console.error(`Unknown command: ${cmd}\n`);
  usage();
  process.exit(1);
}

main();
