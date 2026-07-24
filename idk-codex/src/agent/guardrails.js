/**
 * MAX 2.0 — Lint + Revert Guardrails
 *
 * After every file write/edit, check if the file is valid (syntax check).
 * If it fails, auto-revert to the previous version and tell the agent.
 *
 * Inspired by SWE-agent's 100%-precision guardrails:
 *   - Only fires when definitively wrong (syntax error)
 *   - Auto-reverts the bad edit
 *   - Feeds the error back to the agent so it can retry
 *
 * Supports: JavaScript, TypeScript, Python, JSON, HTML
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const SANDBOX = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

// File backup cache (for reverting)
const backups = new Map();

/**
 * Validate a file based on its extension.
 * Returns { valid: boolean, error: string|null }
 */
export function validateFile(filePath) {
  const fullPath = path.resolve(SANDBOX, filePath);

  if (!fs.existsSync(fullPath)) {
    return { valid: true, error: null }; // Can't validate non-existent file
  }

  const ext = path.extname(filePath).toLowerCase();

  try {
    switch (ext) {
      case '.js':
      case '.mjs':
      case '.cjs':
        return validateJavaScript(fullPath);

      case '.ts':
      case '.tsx':
        return validateTypeScript(fullPath);

      case '.py':
        return validatePython(fullPath);

      case '.json':
        return validateJSON(fullPath);

      case '.html':
      case '.htm':
        return validateHTML(fullPath);

      case '.css':
        return validateCSS(fullPath);

      default:
        // Unknown file type — assume valid
        return { valid: true, error: null };
    }
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

function validateJavaScript(filePath) {
  try {
    execSync(`node --check "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { valid: true, error: null };
  } catch (err) {
    const stderr = err.stderr || err.message;
    return { valid: false, error: `JavaScript syntax error: ${stderr.trim()}` };
  }
}

function validateTypeScript(filePath) {
  // Use node --check for basic syntax (doesn't do full TS type checking but catches syntax errors)
  try {
    execSync(`node --check "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { valid: true, error: null };
  } catch (err) {
    // TS files will have type annotations that node doesn't understand,
    // but syntax errors will still be caught. Only report clear syntax errors.
    const stderr = err.stderr || err.message;
    if (stderr.includes('SyntaxError')) {
      return { valid: false, error: `TypeScript syntax error: ${stderr.trim()}` };
    }
    return { valid: true, error: null };
  }
}

function validatePython(filePath) {
  try {
    execSync(`python3 -m py_compile "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { valid: true, error: null };
  } catch (err) {
    const stderr = err.stderr || err.message;
    return { valid: false, error: `Python syntax error: ${stderr.trim()}` };
  }
}

function validateJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(content);
    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: `JSON parse error: ${err.message}` };
  }
}

function validateHTML(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Basic HTML validation — check for unclosed tags
    const openTags = content.match(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g) || [];
    const closeTags = content.match(/<\/([a-zA-Z][a-zA-Z0-9]*)>/g) || [];

    // Self-closing tags don't need closing
    const selfClosing = openTags.filter(t => t.endsWith('/>') || /<(meta|img|br|hr|input|link|area|base|col|embed|source|track|wbr)/i.test(t));

    const opens = openTags.length - selfClosing.length;
    const closes = closeTags.length;

    // Allow some imbalance for HTML5 but flag major issues
    if (Math.abs(opens - closes) > 5) {
      return { valid: false, error: `HTML tag mismatch: ${opens} opening tags, ${closes} closing tags` };
    }

    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: `HTML validation error: ${err.message}` };
  }
}

function validateCSS(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Basic CSS validation — check for unclosed braces
    const opens = (content.match(/{/g) || []).length;
    const closes = (content.match(/}/g) || []).length;

    if (opens !== closes) {
      return { valid: false, error: `CSS brace mismatch: ${opens} opening braces, ${closes} closing braces` };
    }

    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: `CSS validation error: ${err.message}` };
  }
}

/**
 * Backup a file before editing (for potential revert).
 */
export function backupFile(filePath) {
  const fullPath = path.resolve(SANDBOX, filePath);

  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    backups.set(fullPath, content);
    logger.debug('File backed up', { filePath });
  }
}

/**
 * Revert a file to its backed-up version.
 */
export function revertFile(filePath) {
  const fullPath = path.resolve(SANDBOX, filePath);
  const backup = backups.get(fullPath);

  if (backup !== undefined) {
    fs.writeFileSync(fullPath, backup, 'utf-8');
    logger.info('File reverted', { filePath });
    backups.delete(fullPath);
    return true;
  }

  return false;
}

/**
 * Validate a file after writing/editing. If invalid, revert and return the error.
 *
 * @param {string} filePath - path to the file (relative to sandbox)
 * @returns {Object} { valid: boolean, error: string|null, reverted: boolean }
 */
export function validateAndRevert(filePath) {
  const validation = validateFile(filePath);

  if (validation.valid) {
    // File is valid — clear the backup
    backups.delete(path.resolve(SANDBOX, filePath));
    return { valid: true, error: null, reverted: false };
  }

  // File is invalid — try to revert
  const reverted = revertFile(filePath);

  if (reverted) {
    logger.warn('File failed validation, reverted to previous version', {
      filePath,
      error: validation.error
    });
    return {
      valid: false,
      error: `File failed validation and was reverted. Error: ${validation.error}. Please try a different approach.`,
      reverted: true
    };
  }

  // No backup to revert to — just report the error
  logger.warn('File failed validation, no backup to revert', {
    filePath,
    error: validation.error
  });
  return {
    valid: false,
    error: `File validation warning: ${validation.error}`,
    reverted: false
  };
}

export default {
  validateFile,
  validateAndRevert,
  backupFile,
  revertFile
};
