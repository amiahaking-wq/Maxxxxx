import { SpecialistAgent } from './base.js';
import { executeExecutePhase } from '../phases/execute.js';
import logger from '../../utils/logger.js';
import fs from 'fs';

/**
 * Coding Specialist
 *
 * Handles code generation and implementation:
 * - Writing new code
 * - Modifying existing files
 * - Refactoring
 * - Bug fixes
 * - Always adds co-authorship attribution
 *
 * Based on Claude Code's coding specialist implementation
 */
export class CodingSpecialist extends SpecialistAgent {
  constructor() {
    super(
      'coding',
      ['implement', 'code', 'write', 'modify', 'refactor', 'fix', 'generate', 'create file'],
      'Handles code generation, implementation, and file modifications'
    );
  }

  /**
   * Execute coding task
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(task, context) {
    try {
      const taskStr = typeof task === 'string' ? task : task.description || '';
      this.log('Executing coding task', { task: taskStr });

      // Route to appropriate handler
      if (taskStr.toLowerCase().includes('write') ||
          taskStr.toLowerCase().includes('create')) {
        return await this.writeCode(task, context);
      } else if (taskStr.toLowerCase().includes('modify') ||
                 taskStr.toLowerCase().includes('edit')) {
        return await this.modifyCode(task, context);
      } else if (taskStr.toLowerCase().includes('refactor')) {
        return await this.refactorCode(task, context);
      } else if (taskStr.toLowerCase().includes('fix')) {
        return await this.fixCode(task, context);
      } else {
        // Default to general implementation
        return await this.implementTask(task, context);
      }
    } catch (error) {
      this.logError('Coding task failed', error, { task });
      return this.failure(error.message, { task });
    }
  }

  /**
   * Write new code
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Result
   */
  async writeCode(task, context) {
    try {
      const { filepath, content, plan } = context;

      if (!filepath || !content) {
        // Use existing execute phase for complex generation
        return await this.implementTask(task, context);
      }

      this.log('Writing new code', { filepath });

      // Ensure directory exists
      const dir = filepath.substring(0, filepath.lastIndexOf('/'));
      if (dir) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      // Write file
      await fs.promises.writeFile(filepath, content, 'utf-8');

      return this.success(
        {
          filesModified: [filepath],
          action: 'write',
          attribution: 'Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>'
        },
        `File ${filepath} created successfully`
      );
    } catch (error) {
      this.logError('Failed to write code', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * Modify existing code
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Result
   */
  async modifyCode(task, context) {
    try {
      const { filepath, oldContent, newContent } = context;

      if (!filepath) {
        // Use existing execute phase for complex modifications
        return await this.implementTask(task, context);
      }

      this.log('Modifying code', { filepath });

      if (oldContent && newContent) {
        // Simple replacement
        const content = await fs.promises.readFile(filepath, 'utf-8');
        const updated = content.replace(oldContent, newContent);
        await fs.promises.writeFile(filepath, updated, 'utf-8');
      } else {
        // Use execute phase for AI-powered modification
        return await this.implementTask(task, context);
      }

      return this.success(
        {
          filesModified: [filepath],
          action: 'modify',
          attribution: 'Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>'
        },
        `File ${filepath} modified successfully`
      );
    } catch (error) {
      this.logError('Failed to modify code', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * Refactor code
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Result
   */
  async refactorCode(task, context) {
    try {
      this.log('Refactoring code', { task });

      // Use execute phase for AI-powered refactoring
      return await this.implementTask(task, context);
    } catch (error) {
      this.logError('Failed to refactor code', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * Fix code (bug fixes)
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Result
   */
  async fixCode(task, context) {
    try {
      this.log('Fixing code', { task });

      // Use execute phase for AI-powered bug fixing
      const result = await this.implementTask(task, context);

      if (result.success) {
        result.data.action = 'fix';
      }

      return result;
    } catch (error) {
      this.logError('Failed to fix code', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * General task implementation using existing execute phase
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Result
   */
  async implementTask(task, context) {
    try {
      const taskDescription = typeof task === 'string' ? task : task.description;
      const plan = context.plan || { plan: taskDescription };

      this.log('Implementing task using execute phase', { task: taskDescription });

      // Use existing executeExecutePhase from loop.js
      const result = await executeExecutePhase(plan, context.budgetManager);

      if (!result.success) {
        return this.failure(result.error || 'Implementation failed', { result });
      }

      // Add co-authorship attribution
      const attribution = 'Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>';

      return this.success(
        {
          filesModified: result.filesModified || [],
          code: result.code,
          attribution,
          action: 'implement'
        },
        'Implementation completed successfully'
      );
    } catch (error) {
      this.logError('Failed to implement task', error, { context });
      return this.failure(error.message);
    }
  }

  /**
   * Validate code before writing
   *
   * @param {string} code - Code to validate
   * @param {string} language - Programming language
   * @returns {Object} Validation result
   */
  validateCode(code, language = 'javascript') {
    const issues = [];

    // Basic validation checks
    if (!code || code.trim().length === 0) {
      issues.push('Code is empty');
    }

    // Language-specific checks
    if (language === 'javascript' || language === 'typescript') {
      // Check for console.log (should use logger)
      if (code.includes('console.log')) {
        issues.push('Contains console.log - should use logger');
      }

      // Check for proper error handling
      if (code.includes('async ') && !code.includes('try') && !code.includes('catch')) {
        issues.push('Async function without try-catch block');
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Add JSDoc comments to code
   *
   * @param {string} code - Code to document
   * @returns {string} Documented code
   */
  addDocumentation(code) {
    // This is a placeholder - in a full implementation,
    // this would use AI to generate proper JSDoc comments
    return code;
  }
}
