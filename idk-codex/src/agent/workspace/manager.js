/**
 * Workspace Manager
 *
 * Manages isolated workspace directories for agent sessions.
 * Handles repository cloning, initialization, and cleanup.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import logger from '../../utils/logger.js';

/**
 * Workspace Manager class
 */
class WorkspaceManager {
  /**
   * Create a new workspace manager
   * @param {string} sessionId - Session identifier
   */
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.path = path.join(
      process.env.SANDBOX_WORKSPACE || '/app/sandbox-workspace',
      sessionId
    );

    logger.info('Workspace manager created', { sessionId, path: this.path });
  }

  /**
   * Initialize workspace directory
   * @returns {Promise<string>} Workspace path
   */
  async init() {
    try {
      logger.info('Initializing workspace', { sessionId: this.sessionId, path: this.path });

      // Create workspace directory
      await fs.mkdir(this.path, { recursive: true });

      // Check if we should clone a repository
      const repoUrl = process.env.WORKSPACE_REPO_URL;
      const repoBranch = process.env.WORKSPACE_REPO_BRANCH || 'main';

      if (repoUrl) {
        logger.info('Cloning repository to workspace', { repoUrl, branch: repoBranch });

        // Check if already cloned
        const gitDir = path.join(this.path, '.git');
        try {
          await fs.access(gitDir);
          logger.info('Repository already cloned, pulling latest changes');

          // Pull latest changes
          await this.execGit(['pull', 'origin', repoBranch]);
        } catch (error) {
          // Not cloned yet, clone it
          logger.info('Cloning repository for first time');
          await this.cloneRepository(repoUrl, repoBranch);
        }
      } else {
        logger.info('No repository configured, using empty workspace');
      }

      logger.info('Workspace initialized successfully', {
        sessionId: this.sessionId,
        path: this.path
      });

      return this.path;
    } catch (error) {
      logger.error('Failed to initialize workspace', {
        sessionId: this.sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clone repository to workspace
   * @param {string} repoUrl - Repository URL
   * @param {string} branch - Branch name
   * @returns {Promise<void>}
   */
  async cloneRepository(repoUrl, branch) {
    try {
      return await new Promise((resolve, reject) => {
        const git = spawn('git', [
          'clone',
          '--depth', '1',
          '--branch', branch,
          repoUrl,
          this.path
        ]);

        let stdout = '';
        let stderr = '';

        git.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        git.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        git.on('close', (code) => {
          if (code === 0) {
            logger.info('Repository cloned successfully', { repoUrl, branch });
            resolve();
          } else {
            logger.error('Failed to clone repository', { code, stderr });
            reject(new Error(`Git clone failed with code ${code}: ${stderr}`));
          }
        });

        git.on('error', (error) => {
          logger.error('Git clone process error', { error: error.message });
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Clone repository failed', {
        repoUrl,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute git command in workspace
   * @param {Array<string>} args - Git command arguments
   * @returns {Promise<string>} Command output
   */
  async execGit(args) {
    try {
      return await new Promise((resolve, reject) => {
        const git = spawn('git', args, {
          cwd: this.path
        });

        let stdout = '';
        let stderr = '';

        git.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        git.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        git.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Git command failed: ${stderr}`));
          }
        });

        git.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Git command failed', {
        args,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get workspace path
   * @returns {string} Workspace path
   */
  getPath() {
    return this.path;
  }

  /**
   * Check if workspace exists
   * @returns {Promise<boolean>} True if workspace exists
   */
  async exists() {
    try {
      await fs.access(this.path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up workspace (optional, scheduled)
   * @param {number} delayHours - Hours to wait before cleanup (default: 24)
   * @returns {Promise<void>}
   */
  async scheduleCleanup(delayHours = 24) {
    try {
      logger.info('Scheduling workspace cleanup', {
        sessionId: this.sessionId,
        delayHours
      });

      // Don't actually delete immediately, just log
      // In production, this would be handled by a separate cleanup service
      setTimeout(() => {
        logger.info('Workspace cleanup scheduled', {
          sessionId: this.sessionId,
          path: this.path
        });
      }, delayHours * 60 * 60 * 1000);
    } catch (error) {
      logger.warn('Failed to schedule cleanup', {
        sessionId: this.sessionId,
        error: error.message
      });
    }
  }

  /**
   * Immediately clean up workspace
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      logger.info('Cleaning up workspace', {
        sessionId: this.sessionId,
        path: this.path
      });

      await fs.rm(this.path, { recursive: true, force: true });

      logger.info('Workspace cleaned up successfully', {
        sessionId: this.sessionId
      });
    } catch (error) {
      logger.error('Failed to cleanup workspace', {
        sessionId: this.sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get workspace statistics
   * @returns {Promise<Object>} Workspace stats
   */
  async getStats() {
    try {
      const stats = await fs.stat(this.path);

      // Count files recursively
      let fileCount = 0;
      let totalSize = 0;

      async function countFiles(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Skip node_modules and .git
            if (entry.name !== 'node_modules' && entry.name !== '.git') {
              await countFiles(fullPath);
            }
          } else if (entry.isFile()) {
            fileCount++;
            const fileStat = await fs.stat(fullPath);
            totalSize += fileStat.size;
          }
        }
      }

      await countFiles(this.path);

      return {
        path: this.path,
        fileCount,
        totalSize,
        created: stats.birthtime,
        modified: stats.mtime
      };
    } catch (error) {
      logger.error('Failed to get workspace stats', {
        sessionId: this.sessionId,
        error: error.message
      });
      return {
        path: this.path,
        fileCount: 0,
        totalSize: 0,
        error: error.message
      };
    }
  }
}

export default WorkspaceManager;
