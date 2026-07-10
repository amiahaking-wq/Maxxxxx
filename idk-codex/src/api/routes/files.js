/**
 * File system API routes
 * Provides access to workspace files
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Safe workspace directory
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), 'workspace');

/**
 * Validate path is within workspace
 * @param {string} filePath - Path to validate
 * @returns {boolean} Whether path is safe
 */
function isPathSafe(filePath) {
  const normalized = path.normalize(filePath);
  return normalized.startsWith(WORKSPACE_ROOT);
}

/**
 * GET /api/files
 * List files in workspace directory
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const dirPath = req.query.path || WORKSPACE_ROOT;
    const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(WORKSPACE_ROOT, dirPath);

    if (!isPathSafe(fullPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const files = entries.map(entry => ({
      name: entry.name,
      path: path.join(fullPath, entry.name),
      relativePath: path.relative(WORKSPACE_ROOT, path.join(fullPath, entry.name)),
      type: entry.isDirectory() ? 'directory' : 'file',
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile()
    }));

    res.json({
      success: true,
      path: fullPath,
      relativePath: path.relative(WORKSPACE_ROOT, fullPath),
      files
    });
  } catch (error) {
    logger.error('Failed to list files', { error: error.message });
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * GET /api/files/tree
 * Get recursive file tree
 */
router.get('/tree', authenticate, async (req, res) => {
  try {
    const maxDepth = parseInt(req.query.maxDepth) || 3;

    /**
     * Build file tree recursively
     * @param {string} dirPath - Directory path
     * @param {number} depth - Current depth
     * @returns {Object} Tree structure
     */
    function buildTree(dirPath, depth = 0) {
      if (depth >= maxDepth) return null;

      const stats = fs.statSync(dirPath);
      const name = path.basename(dirPath);

      if (stats.isFile()) {
        return {
          name,
          path: dirPath,
          relativePath: path.relative(WORKSPACE_ROOT, dirPath),
          type: 'file',
          size: stats.size
        };
      }

      if (stats.isDirectory()) {
        // Skip common directories
        if (['node_modules', '.git', 'dist', 'build', '.next'].includes(name)) {
          return null;
        }

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const children = entries
          .map(entry => buildTree(path.join(dirPath, entry.name), depth + 1))
          .filter(child => child !== null);

        return {
          name,
          path: dirPath,
          relativePath: path.relative(WORKSPACE_ROOT, dirPath),
          type: 'directory',
          children
        };
      }

      return null;
    }

    const tree = buildTree(WORKSPACE_ROOT);

    res.json({
      success: true,
      tree
    });
  } catch (error) {
    logger.error('Failed to build file tree', { error: error.message });
    res.status(500).json({ error: 'Failed to build file tree' });
  }
});

/**
 * GET /api/files/content
 * Get file contents
 */
router.get('/content', authenticate, async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_ROOT, filePath);

    if (!isPathSafe(fullPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    // Check file size (max 1MB for text files)
    if (stats.size > 1024 * 1024) {
      return res.status(413).json({ error: 'File too large' });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');

    res.json({
      success: true,
      path: fullPath,
      relativePath: path.relative(WORKSPACE_ROOT, fullPath),
      content,
      size: stats.size,
      modified: stats.mtime
    });
  } catch (error) {
    logger.error('Failed to read file', {
      path: req.query.path,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to read file' });
  }
});

/**
 * GET /api/files/sandbox/:filename
 * Public (no-auth) endpoint to read a file from the sandbox workspace.
 * Used by the Telegram bot to show generated files to the user.
 *
 * Path is resolved against SANDBOX_WORKSPACE. Only files within the sandbox
 * can be read — path traversal attempts are rejected.
 */
router.get('/sandbox/*', async (req, res) => {
  try {
    const requestedPath = req.params[0]; // everything after /sandbox/
    if (!requestedPath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const sandboxRoot = path.resolve(process.env.SANDBOX_WORKSPACE || './sandbox-workspace');
    const fullPath = path.resolve(sandboxRoot, requestedPath);

    // Prevent path traversal — must be inside the sandbox
    if (!fullPath.startsWith(sandboxRoot)) {
      return res.status(403).json({ error: 'Access denied — path outside sandbox' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found', path: requestedPath, sandboxRoot });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      // List directory contents
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      return res.json({
        success: true,
        type: 'directory',
        path: requestedPath,
        entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))
      });
    }

    if (stats.size > 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (max 1MB)' });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');

    // Return as JSON with content, or as raw text if ?raw=true
    if (req.query.raw === 'true') {
      res.type('text/plain').send(content);
    } else {
      res.json({
        success: true,
        type: 'file',
        path: requestedPath,
        content,
        size: stats.size,
        modified: stats.mtime
      });
    }
  } catch (error) {
    logger.error('Failed to read sandbox file', { error: error.message });
    res.status(500).json({ error: 'Failed to read file', details: error.message });
  }
});

/**
 * POST /api/files/content
 * Write file contents
 */
router.post('/content', authenticate, async (req, res) => {
  try {
    const { path: filePath, content } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_ROOT, filePath);

    if (!isPathSafe(fullPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf-8');

    logger.info('File written via API', {
      path: fullPath,
      size: content.length
    });

    res.json({
      success: true,
      path: fullPath,
      relativePath: path.relative(WORKSPACE_ROOT, fullPath),
      size: content.length
    });
  } catch (error) {
    logger.error('Failed to write file', {
      path: req.body.path,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to write file' });
  }
});

export default router;
