/**
 * MAX State Manager
 *
 * Manages MAX task and milestone state with database persistence.
 * Handles context memory purging and state synchronization between micro-agents.
 */

import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';
import { randomUUID } from 'crypto';

/**
 * State manager for MAX orchestration
 */
export class MAXStateManager {
  constructor() {
    this.activeTasks = new Map();
    this.activeMilestones = new Map();
  }

  /**
   * Create a new MAX task
   *
   * @param {Object} params - Task parameters
   * @param {number} params.sessionId - Session ID
   * @param {string} params.description - Task description
   * @param {number} params.userId - User ID
   * @returns {Promise<string>} Task ID
   */
  async createTask({ sessionId, description, userId }) {
    try {
      const taskId = randomUUID();
      const db = getDatabase();

      const stmt = db.prepare(`
        INSERT INTO max_tasks (id, session_id, description, status, created_at)
        VALUES (?, ?, ?, 'planning', ?)
      `);

      stmt.run(taskId, sessionId, description, Date.now());

      this.activeTasks.set(taskId, {
        id: taskId,
        sessionId,
        description,
        status: 'planning',
        userId,
        createdAt: Date.now()
      });

      logger.info('Created MAX task', {
        taskId,
        sessionId,
        description: description.substring(0, 100)
      });

      return taskId;

    } catch (error) {
      logger.error('Failed to create MAX task', {
        error: error.message,
        sessionId,
        description
      });
      throw error;
    }
  }

  /**
   * Update task status
   *
   * @param {string} taskId - Task ID
   * @param {string} status - New status ('planning', 'executing', 'completed', 'failed')
   * @returns {Promise<void>}
   */
  async updateTaskStatus(taskId, status) {
    try {
      const db = getDatabase();

      const stmt = db.prepare(`
        UPDATE max_tasks
        SET status = ?,
            completed_at = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE completed_at END
        WHERE id = ?
      `);

      stmt.run(status, status, Date.now(), taskId);

      const task = this.activeTasks.get(taskId);
      if (task) {
        task.status = status;
        if (status === 'completed' || status === 'failed') {
          task.completedAt = Date.now();
        }
      }

      logger.info('Updated MAX task status', { taskId, status });

    } catch (error) {
      logger.error('Failed to update MAX task status', {
        error: error.message,
        taskId,
        status
      });
      throw error;
    }
  }

  /**
   * Get task by ID
   *
   * @param {string} taskId - Task ID
   * @returns {Promise<Object|null>} Task object or null
   */
  async getTask(taskId) {
    try {
      // Check memory cache first
      if (this.activeTasks.has(taskId)) {
        return this.activeTasks.get(taskId);
      }

      // Fetch from database
      const db = getDatabase();
      const stmt = db.prepare('SELECT * FROM max_tasks WHERE id = ?');
      const task = stmt.get(taskId);

      if (task) {
        this.activeTasks.set(taskId, task);
      }

      return task;

    } catch (error) {
      logger.error('Failed to get MAX task', {
        error: error.message,
        taskId
      });
      throw error;
    }
  }

  /**
   * Create a new milestone
   *
   * @param {Object} params - Milestone parameters
   * @param {string} params.taskId - Task ID
   * @param {string} params.agentRole - Agent role ('architect', 'engineer', 'devops', 'media')
   * @param {string} params.description - Milestone description
   * @param {Array} params.dependencies - Array of milestone IDs this depends on
   * @param {number} params.estimatedTokens - Estimated token usage
   * @returns {Promise<string>} Milestone ID
   */
  async createMilestone({ taskId, agentRole, description, dependencies, estimatedTokens }) {
    try {
      const milestoneId = randomUUID();
      const db = getDatabase();

      const stmt = db.prepare(`
        INSERT INTO max_milestones (
          id, task_id, agent_role, description, status,
          dependencies, context_size, created_at
        )
        VALUES (?, ?, ?, ?, 'pending', ?, 0, ?)
      `);

      const dependenciesJson = JSON.stringify(dependencies || []);
      stmt.run(
        milestoneId,
        taskId,
        agentRole,
        description,
        dependenciesJson,
        Date.now()
      );

      this.activeMilestones.set(milestoneId, {
        id: milestoneId,
        taskId,
        agentRole,
        description,
        status: 'pending',
        dependencies: dependencies || [],
        contextSize: 0,
        estimatedTokens: estimatedTokens || 0,
        createdAt: Date.now()
      });

      logger.info('Created MAX milestone', {
        milestoneId,
        taskId,
        agentRole,
        description: description.substring(0, 100)
      });

      return milestoneId;

    } catch (error) {
      logger.error('Failed to create MAX milestone', {
        error: error.message,
        taskId,
        agentRole
      });
      throw error;
    }
  }

  /**
   * Update milestone status
   *
   * @param {string} milestoneId - Milestone ID
   * @param {string} status - New status ('pending', 'active', 'completed', 'failed')
   * @returns {Promise<void>}
   */
  async updateMilestoneStatus(milestoneId, status) {
    try {
      const db = getDatabase();

      const stmt = db.prepare(`
        UPDATE max_milestones
        SET status = ?,
            completed_at = CASE WHEN ? IN ('completed', 'failed') THEN ? ELSE completed_at END
        WHERE id = ?
      `);

      stmt.run(status, status, Date.now(), milestoneId);

      const milestone = this.activeMilestones.get(milestoneId);
      if (milestone) {
        milestone.status = status;
        if (status === 'completed' || status === 'failed') {
          milestone.completedAt = Date.now();
        }
      }

      logger.info('Updated MAX milestone status', { milestoneId, status });

    } catch (error) {
      logger.error('Failed to update MAX milestone status', {
        error: error.message,
        milestoneId,
        status
      });
      throw error;
    }
  }

  /**
   * Update milestone context size
   *
   * @param {string} milestoneId - Milestone ID
   * @param {number} contextSize - Context size in tokens
   * @returns {Promise<void>}
   */
  async updateMilestoneContextSize(milestoneId, contextSize) {
    try {
      const db = getDatabase();

      const stmt = db.prepare(`
        UPDATE max_milestones
        SET context_size = ?
        WHERE id = ?
      `);

      stmt.run(contextSize, milestoneId);

      const milestone = this.activeMilestones.get(milestoneId);
      if (milestone) {
        milestone.contextSize = contextSize;
      }

      logger.debug('Updated MAX milestone context size', {
        milestoneId,
        contextSize
      });

    } catch (error) {
      logger.error('Failed to update MAX milestone context size', {
        error: error.message,
        milestoneId,
        contextSize
      });
      throw error;
    }
  }

  /**
   * Get milestones for a task
   *
   * @param {string} taskId - Task ID
   * @param {string|null} status - Filter by status (optional)
   * @returns {Promise<Array>} Array of milestones
   */
  async getMilestones(taskId, status = null) {
    try {
      const db = getDatabase();

      let query = 'SELECT * FROM max_milestones WHERE task_id = ?';
      const params = [taskId];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at ASC';

      const stmt = db.prepare(query);
      const milestones = stmt.all(...params);

      // Parse dependencies JSON
      return milestones.map(m => ({
        ...m,
        dependencies: JSON.parse(m.dependencies || '[]')
      }));

    } catch (error) {
      logger.error('Failed to get MAX milestones', {
        error: error.message,
        taskId,
        status
      });
      throw error;
    }
  }

  /**
   * Record a context purge event
   *
   * @param {string} milestoneId - Milestone ID
   * @param {number} tokensFreed - Number of tokens freed
   * @returns {Promise<number>} Purge record ID
   */
  async recordContextPurge(milestoneId, tokensFreed) {
    try {
      const db = getDatabase();

      const stmt = db.prepare(`
        INSERT INTO max_context_purges (milestone_id, tokens_freed, purged_at)
        VALUES (?, ?, ?)
      `);

      const result = stmt.run(milestoneId, tokensFreed, Date.now());

      logger.info('Recorded context purge', {
        milestoneId,
        tokensFreed,
        purgeId: result.lastInsertRowid
      });

      return result.lastInsertRowid;

    } catch (error) {
      logger.error('Failed to record context purge', {
        error: error.message,
        milestoneId,
        tokensFreed
      });
      throw error;
    }
  }

  /**
   * Get context purge statistics for a task
   *
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Purge statistics
   */
  async getPurgeStats(taskId) {
    try {
      const db = getDatabase();

      const stmt = db.prepare(`
        SELECT
          COUNT(*) as purge_count,
          SUM(mcp.tokens_freed) as total_tokens_freed
        FROM max_context_purges mcp
        JOIN max_milestones mm ON mcp.milestone_id = mm.id
        WHERE mm.task_id = ?
      `);

      const stats = stmt.get(taskId);

      return {
        purgeCount: stats.purge_count || 0,
        totalTokensFreed: stats.total_tokens_freed || 0
      };

    } catch (error) {
      logger.error('Failed to get purge stats', {
        error: error.message,
        taskId
      });
      throw error;
    }
  }

  /**
   * Get task execution statistics
   *
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Execution statistics
   */
  async getTaskStats(taskId) {
    try {
      const db = getDatabase();

      const milestoneStats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(context_size) as total_context
        FROM max_milestones
        WHERE task_id = ?
      `).get(taskId);

      const purgeStats = await this.getPurgeStats(taskId);

      return {
        milestones: {
          total: milestoneStats.total || 0,
          completed: milestoneStats.completed || 0,
          failed: milestoneStats.failed || 0,
          active: milestoneStats.active || 0,
          pending: milestoneStats.pending || 0,
          totalContext: milestoneStats.total_context || 0
        },
        purges: purgeStats
      };

    } catch (error) {
      logger.error('Failed to get task stats', {
        error: error.message,
        taskId
      });
      throw error;
    }
  }

  /**
   * Clear completed task from memory cache
   *
   * @param {string} taskId - Task ID
   */
  clearTaskCache(taskId) {
    this.activeTasks.delete(taskId);

    // Clear associated milestones
    for (const [milestoneId, milestone] of this.activeMilestones.entries()) {
      if (milestone.taskId === taskId) {
        this.activeMilestones.delete(milestoneId);
      }
    }

    logger.debug('Cleared task cache', { taskId });
  }
}

export default MAXStateManager;
