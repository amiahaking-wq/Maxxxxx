import * as fsSafe from 'fs-safe';
import { promises as fs } from 'fs';
import { join, dirname, resolve } from 'path';
import logger from './logger.js';

const SANDBOX_WORKSPACE = resolve(process.env.SANDBOX_WORKSPACE || './sandbox-workspace');

/**
 * Get full path within sandbox
 * @param {string} relativePath - Relative path
 * @returns {string} Full path
 */
function getSandboxPath(relativePath) {
  return join(SANDBOX_WORKSPACE, relativePath);
}

/**
 * Ensure sandbox workspace exists
 */
export async function ensureSandbox() {
  try {
    await fs.mkdir(SANDBOX_WORKSPACE, { recursive: true });
    logger.info(`Sandbox workspace ready: ${SANDBOX_WORKSPACE}`);
  } catch (error) {
    logger.error('Failed to create sandbox workspace', { error: error.message });
    throw error;
  }
}

/**
 * Read file from sandbox safely
 * @param {string} filePath - Relative path within sandbox
 * @returns {Promise<string>} File contents
 */
export async function readFileSafe(filePath) {
  try {
    const fullPath = getSandboxPath(filePath);
    const content = await fsSafe.readFile(fullPath, { encoding: 'utf-8' });
    logger.debug('Read file', { filePath });
    return content;
  } catch (error) {
    logger.error('Failed to read file', { filePath, error: error.message });
    throw error;
  }
}

/**
 * Write file to sandbox safely
 * @param {string} filePath - Relative path within sandbox
 * @param {string} content - File content
 */
export async function writeFileSafe(filePath, content) {
  try {
    const fullPath = getSandboxPath(filePath);
    // Ensure directory exists
    const dir = dirname(fullPath);
    await fsSafe.writeDir(dir);

    await fsSafe.writeFile(fullPath, content, { encoding: 'utf-8' });
    logger.info('Wrote file', { filePath, size: content.length });
  } catch (error) {
    logger.error('Failed to write file', { filePath, error: error.message });
    throw error;
  }
}

/**
 * Check if file exists in sandbox
 * @param {string} filePath - Relative path within sandbox
 * @returns {Promise<boolean>} True if file exists
 */
export async function existsSafe(filePath) {
  try {
    const fullPath = getSandboxPath(filePath);
    return await fsSafe.fileExists(fullPath);
  } catch {
    return false;
  }
}

/**
 * Delete file from sandbox safely
 * @param {string} filePath - Relative path within sandbox
 */
export async function deleteFileSafe(filePath) {
  try {
    const fullPath = getSandboxPath(filePath);
    await fsSafe.removeFile(fullPath);
    logger.info('Deleted file', { filePath });
  } catch (error) {
    logger.error('Failed to delete file', { filePath, error: error.message });
    throw error;
  }
}

/**
 * List files in directory within sandbox
 * @param {string} dirPath - Relative directory path within sandbox
 * @returns {Promise<Array<string>>} List of files
 */
export async function listFilesSafe(dirPath = '.') {
  try {
    const fullPath = getSandboxPath(dirPath);
    const files = await fsSafe.readDir(fullPath);
    logger.debug('Listed files', { dirPath, count: files.length });
    return files;
  } catch (error) {
    logger.error('Failed to list files', { dirPath, error: error.message });
    throw error;
  }
}

/**
 * Create directory in sandbox safely
 * @param {string} dirPath - Relative directory path within sandbox
 */
export async function mkdirSafe(dirPath) {
  try {
    const fullPath = getSandboxPath(dirPath);
    await fsSafe.writeDir(fullPath);
    logger.info('Created directory', { dirPath });
  } catch (error) {
    logger.error('Failed to create directory', { dirPath, error: error.message });
    throw error;
  }
}

/**
 * Get file stats
 * @param {string} filePath - Relative path within sandbox
 * @returns {Promise<Object>} File stats
 */
export async function getStatsSafe(filePath) {
  try {
    const fullPath = getSandboxPath(filePath);
    const stats = await fs.stat(fullPath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime,
      created: stats.birthtime
    };
  } catch (error) {
    logger.error('Failed to get file stats', { filePath, error: error.message });
    throw error;
  }
}

/**
 * Copy file within sandbox
 * @param {string} srcPath - Source path
 * @param {string} destPath - Destination path
 */
export async function copyFileSafe(srcPath, destPath) {
  try {
    const fullSrcPath = getSandboxPath(srcPath);
    const fullDestPath = getSandboxPath(destPath);
    const content = await fsSafe.readFile(fullSrcPath);
    const destDir = dirname(fullDestPath);
    await fsSafe.writeDir(destDir);
    await fsSafe.writeFile(fullDestPath, content);
    logger.info('Copied file', { srcPath, destPath });
  } catch (error) {
    logger.error('Failed to copy file', { srcPath, destPath, error: error.message });
    throw error;
  }
}

/**
 * Read directory tree recursively
 * @param {string} dirPath - Directory path
 * @param {number} maxDepth - Maximum depth to recurse
 * @returns {Promise<Array<string>>} List of all file paths
 */
export async function readDirectoryTree(dirPath = '.', maxDepth = 5) {
  const files = [];

  async function traverse(currentPath, depth) {
    if (depth > maxDepth) return;

    try {
      const fullPath = getSandboxPath(currentPath);
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
            await traverse(relativePath, depth + 1);
          }
        } else if (entry.isFile()) {
          files.push(relativePath);
        }
      }
    } catch (error) {
      logger.warn('Error traversing directory', { path: currentPath, error: error.message });
    }
  }

  await traverse(dirPath, 0);
  return files;
}

/**
 * Get absolute path within sandbox
 * @param {string} relativePath - Relative path
 * @returns {string} Absolute path
 */
export function getAbsolutePath(relativePath) {
  return join(SANDBOX_WORKSPACE, relativePath);
}

export default {
  ensureSandbox,
  readFileSafe,
  writeFileSafe,
  existsSafe,
  deleteFileSafe,
  listFilesSafe,
  mkdirSafe,
  getStatsSafe,
  copyFileSafe,
  readDirectoryTree,
  getAbsolutePath,
  SANDBOX_WORKSPACE
};
