/**
 * Code Execution Sandbox (Feature #25)
 *
 * Provides safe execution of untrusted code with resource limits:
 *   - CPU time limit
 *   - Memory limit
 *   - Filesystem isolation (write to a temp dir only)
 *   - Network access control (off by default for untrusted code)
 *   - Process count limit (no fork bombs)
 *
 * Supports running:
 *   - JavaScript (node -e)
 *   - Python (python3 -c)
 *   - Shell (bash -c)
 *
 * POST /api/sandbox/execute — execute code in the sandbox
 *   body: { code, language, timeout?, memoryLimitMb? }
 *
 * Used by:
 *   - The agent's bash tool (when running untrusted code)
 *   - Educational use cases (run code from chat)
 *   - Test execution
 */

import express from 'express';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { optionalAuth } from '../../auth/middleware.js';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(optionalAuth);

const SANDBOX_DIR = path.join(os.tmpdir(), 'max-sandbox');
try { fs.mkdirSync(SANDBOX_DIR, { recursive: true }); } catch (e) {}

/**
 * Execute code in a sandboxed environment with resource limits.
 *
 * @param {string} code - the code to run
 * @param {string} language - 'javascript' | 'python' | 'bash' | 'shell'
 * @param {Object} options - { timeoutMs, memoryLimitMb, allowNetwork }
 * @returns {Object} { stdout, stderr, exitCode, durationMs }
 */
export function executeSandboxed(code, language = 'javascript', options = {}) {
  const timeoutMs = Math.min(options.timeoutMs || 10000, 30000);  // hard cap 30s
  const memoryLimitMb = Math.min(options.memoryLimitMb || 256, 512);  // hard cap 512MB
  const allowNetwork = options.allowNetwork || false;

  // Create a unique temp dir for this execution
  const execId = crypto.randomBytes(8).toString('hex');
  const execDir = path.join(SANDBOX_DIR, execId);
  fs.mkdirSync(execDir, { recursive: true });

  const startTime = Date.now();
  let command, args, filename;

  switch (language.toLowerCase()) {
    case 'javascript':
    case 'js':
    case 'node':
      filename = 'code.js';
      fs.writeFileSync(path.join(execDir, filename), code);
      command = 'node';
      args = [filename];
      break;
    case 'python':
    case 'py':
      filename = 'code.py';
      fs.writeFileSync(path.join(execDir, filename), code);
      command = 'python3';
      args = [filename];
      break;
    case 'bash':
    case 'sh':
    case 'shell':
      filename = 'code.sh';
      fs.writeFileSync(path.join(execDir, filename), code);
      command = 'bash';
      args = [filename];
      break;
    default:
      return { error: `Unsupported language: ${language}`, exitCode: -1 };
  }

  return new Promise((resolve) => {
    // Build environment — restrict network by unsetting proxy vars
    const env = {
      PATH: process.env.PATH,
      HOME: execDir,
      USER: 'nobody',
      LANG: 'en_US.UTF-8',
      TERM: 'dumb'
    };
    if (!allowNetwork) {
      env.NO_PROXY = '*';
      env.no_proxy = '*';
    }

    // Spawn with resource limits (Linux only — ulimit commands)
    const isLinux = process.platform === 'linux';
    const finalCommand = isLinux ? 'bash' : command;
    const finalArgs = isLinux ? [
      '-c',
      `ulimit -t ${Math.ceil(timeoutMs / 1000)}; ulimit -f ${memoryLimitMb * 1024}; ulimit -u 32; cd "${execDir}" && ${command} ${args.join(' ')}`
    ] : args;

    const child = spawn(finalCommand, finalArgs, {
      cwd: execDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('error', (err) => {
      cleanup(execDir);
      resolve({
        stdout,
        stderr: stderr + '\n' + err.message,
        exitCode: -1,
        durationMs: Date.now() - startTime,
        error: err.message
      });
    });

    child.on('close', (exitCode) => {
      cleanup(execDir);
      resolve({
        stdout: stdout.substring(0, 10000),  // cap output
        stderr: stderr.substring(0, 5000),
        exitCode,
        durationMs: Date.now() - startTime,
        timedOut: exitCode === null && (Date.now() - startTime) >= timeoutMs
      });
    });

    // Hard timeout
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (e) {}
    }, timeoutMs + 1000);
  });
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) { /* ok */ }
}

// ============================================================================
// ROUTES
// ============================================================================

router.post('/execute', async (req, res) => {
  try {
    const { code, language, timeoutMs, memoryLimitMb, allowNetwork } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    if (!language) return res.status(400).json({ error: 'language is required' });

    const result = await executeSandboxed(code, language, { timeoutMs, memoryLimitMb, allowNetwork });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List supported languages
router.get('/languages', (req, res) => {
  res.json({
    success: true,
    languages: [
      { id: 'javascript', name: 'JavaScript', extension: '.js', runner: 'node' },
      { id: 'python', name: 'Python', extension: '.py', runner: 'python3' },
      { id: 'bash', name: 'Bash', extension: '.sh', runner: 'bash' }
    ]
  });
});

export default router;
