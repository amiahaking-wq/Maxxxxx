// SOUL loader — MAX Agent core identity
// Adapted to ESM (project uses "type": "module")
import fs from 'fs';
import path from 'path';
import os from 'os';

export const MAX_HOME = process.env.MAX_HOME || path.join(os.homedir(), '.max');

export function loadSoul(profile = 'default') {
  const soulPath = path.join(MAX_HOME, 'profiles', profile, 'SOUL.md');
  if (fs.existsSync(soulPath)) return fs.readFileSync(soulPath, 'utf-8');
  const defaultSoul = `# SOUL.md — MAX Agent Core Identity
You are MAX, an autonomous coding and reasoning agent.
- ALWAYS verify before destructive operations
- NEVER expose API keys or credentials in responses
- ALWAYS ask for approval before spending money or accessing sensitive data
- ALWAYS explain your reasoning when asked
- NEVER pretend to know something you don't — use tools to find out
`;
  fs.mkdirSync(path.dirname(soulPath), { recursive: true });
  fs.writeFileSync(soulPath, defaultSoul);
  return defaultSoul;
}
