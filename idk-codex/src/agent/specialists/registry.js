import logger from '../../utils/logger.js';
import { generateCompletion } from '../../groq/client.js';

/**
 * Specialist Registry
 *
 * Central registry for all specialist agents. Handles:
 * - Specialist registration
 * - Task delegation
 * - Specialist lookup
 * - Load balancing (future)
 * - AI-powered task classification (v2.0)
 *
 * Based on Claude Code's specialist coordination system
 */
export class SpecialistRegistry {
  constructor(budgetManager = null) {
    this.specialists = new Map();
    this.delegationHistory = [];
    this.budgetManager = budgetManager;
  }

  /**
   * Register a specialist agent
   *
   * @param {SpecialistAgent} specialist - Specialist instance
   */
  register(specialist) {
    if (this.specialists.has(specialist.name)) {
      logger.warn('Specialist already registered, replacing', {
        name: specialist.name
      });
    }

    this.specialists.set(specialist.name, specialist);
    logger.info('Specialist registered', {
      name: specialist.name,
      capabilities: specialist.capabilities
    });
  }

  /**
   * Unregister a specialist
   *
   * @param {string} name - Specialist name
   * @returns {boolean} True if specialist was removed
   */
  unregister(name) {
    const removed = this.specialists.delete(name);
    if (removed) {
      logger.info('Specialist unregistered', { name });
    }
    return removed;
  }

  /**
   * Find specialist by name
   *
   * @param {string} name - Specialist name
   * @returns {SpecialistAgent|null} Specialist instance or null
   */
  findByName(name) {
    return this.specialists.get(name) || null;
  }

  /**
   * Find specialist that can handle the given task
   *
   * @param {string|Object} task - Task description or object
   * @returns {SpecialistAgent|null} Specialist instance or null
   */
  findSpecialist(task) {
    for (const specialist of this.specialists.values()) {
      if (specialist.canHandle(task)) {
        logger.info('Specialist found for task', {
          specialist: specialist.name,
          task: typeof task === 'string' ? task : task.description
        });
        return specialist;
      }
    }

    logger.warn('No specialist found for task', {
      task: typeof task === 'string' ? task : task.description
    });
    return null;
  }

  /**
   * Delegate task to appropriate specialist
   *
   * @param {string|Object} task - Task to delegate
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Delegation result
   */
  async delegate(task, context = {}) {
    const specialist = this.findSpecialist(task);

    if (!specialist) {
      const error = 'No specialist available to handle task';
      logger.error(error, {
        task: typeof task === 'string' ? task : task.description
      });
      return {
        success: false,
        error,
        task
      };
    }

    try {
      logger.info('Delegating task to specialist', {
        specialist: specialist.name,
        task: typeof task === 'string' ? task : task.description
      });

      const startTime = Date.now();
      const result = await specialist.execute(task, context);
      const duration = Date.now() - startTime;

      // Record delegation
      this.delegationHistory.push({
        specialist: specialist.name,
        task: typeof task === 'string' ? task : task.description,
        success: result.success,
        duration,
        timestamp: new Date().toISOString()
      });

      logger.info('Task delegation completed', {
        specialist: specialist.name,
        success: result.success,
        duration: `${duration}ms`
      });

      return result;
    } catch (error) {
      logger.error('Task delegation failed', {
        specialist: specialist.name,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        specialist: specialist.name,
        task
      };
    }
  }

  /**
   * Delegate to specific specialist by name
   *
   * @param {string} specialistName - Specialist name
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Delegation result
   */
  async delegateTo(specialistName, task, context = {}) {
    const specialist = this.findByName(specialistName);

    if (!specialist) {
      const error = `Specialist '${specialistName}' not found`;
      logger.error(error);
      return {
        success: false,
        error,
        task
      };
    }

    try {
      logger.info('Delegating to specific specialist', {
        specialist: specialistName,
        task: typeof task === 'string' ? task : task.description
      });

      const result = await specialist.execute(task, context);
      return result;
    } catch (error) {
      logger.error('Specialist delegation failed', {
        specialist: specialistName,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        specialist: specialistName,
        task
      };
    }
  }

  /**
   * List all registered specialists
   *
   * @returns {Array<Object>} Array of specialist info objects
   */
  listSpecialists() {
    return Array.from(this.specialists.values()).map(s => s.getInfo());
  }

  /**
   * Get delegation history
   *
   * @param {number} limit - Maximum number of records to return
   * @returns {Array<Object>} Delegation history
   */
  getHistory(limit = 50) {
    return this.delegationHistory.slice(-limit);
  }

  /**
   * Clear delegation history
   */
  clearHistory() {
    this.delegationHistory = [];
    logger.info('Delegation history cleared');
  }

  /**
   * Get statistics about specialist usage
   *
   * @returns {Object} Usage statistics
   */
  getStats() {
    const stats = {
      totalDelegations: this.delegationHistory.length,
      successfulDelegations: 0,
      failedDelegations: 0,
      specialistUsage: {},
      averageDuration: 0
    };

    let totalDuration = 0;

    for (const record of this.delegationHistory) {
      if (record.success) {
        stats.successfulDelegations++;
      } else {
        stats.failedDelegations++;
      }

      stats.specialistUsage[record.specialist] =
        (stats.specialistUsage[record.specialist] || 0) + 1;

      totalDuration += record.duration || 0;
    }

    if (stats.totalDelegations > 0) {
      stats.averageDuration = Math.round(totalDuration / stats.totalDelegations);
    }

    stats.successRate = stats.totalDelegations > 0
      ? ((stats.successfulDelegations / stats.totalDelegations) * 100).toFixed(2) + '%'
      : '0%';

    return stats;
  }

  /**
   * AI-powered specialist selection with confidence scoring
   * v2.0 Enhancement: Uses LLM to classify tasks and select optimal specialist
   *
   * @param {string} task - Task description
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Selection result with confidence score
   */
  async selectSpecialist(task, context = {}) {
    const enableAISelection = process.env.AI_SPECIALIST_SELECTION !== 'false';

    if (!enableAISelection || this.specialists.size === 0) {
      // Fallback to basic selection
      return this.selectSpecialistBasic(task);
    }

    try {
      logger.info('Using AI-powered specialist selection', {
        task: task.substring(0, 100)
      });

      const specialistList = Array.from(this.specialists.values()).map(s => ({
        name: s.name,
        capabilities: s.capabilities,
        description: s.description || 'No description'
      }));

      const prompt = `You are a task classification system. Analyze the task and select the most appropriate specialist.

Task: ${task}

Available Specialists:
${specialistList.map((s, i) => `${i + 1}. ${s.name}
   Capabilities: ${s.capabilities.join(', ')}
   Description: ${s.description}`).join('\n\n')}

Respond with JSON only (no markdown):
{
  "selectedSpecialist": "specialist_name",
  "confidence": 0.95,
  "reasoning": "Why this specialist is best suited"
}`;

      const response = await generateCompletion(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.3,
          maxTokens: 500,
          budgetManager: this.budgetManager
        }
      );

      // Parse AI response
      const selection = JSON.parse(response.content);

      const specialist = this.findByName(selection.selectedSpecialist);

      if (!specialist) {
        logger.warn('AI selected non-existent specialist, falling back', {
          selected: selection.selectedSpecialist
        });
        return this.selectSpecialistBasic(task);
      }

      logger.info('AI specialist selection completed', {
        specialist: specialist.name,
        confidence: selection.confidence,
        reasoning: selection.reasoning
      });

      return {
        specialist,
        confidence: selection.confidence,
        reasoning: selection.reasoning,
        method: 'ai'
      };

    } catch (error) {
      logger.warn('AI specialist selection failed, falling back', {
        error: error.message
      });
      return this.selectSpecialistBasic(task);
    }
  }

  /**
   * Basic specialist selection (fallback)
   *
   * @param {string} task - Task description
   * @returns {Object} Selection result
   */
  selectSpecialistBasic(task) {
    const specialist = this.findSpecialist(task);

    if (!specialist) {
      return {
        specialist: null,
        confidence: 0,
        reasoning: 'No specialist available',
        method: 'basic'
      };
    }

    return {
      specialist,
      confidence: 0.7, // Default confidence for basic selection
      reasoning: 'Selected based on keyword matching',
      method: 'basic'
    };
  }

  /**
   * Delegation rules decision tree
   * v2.0 Enhancement: Provides structured delegation rules
   *
   * @param {string} taskType - Type of task
   * @returns {Object} Delegation rules
   */
  getDelegationRules(taskType) {
    const rules = {
      code_generation: {
        specialist: 'coding',
        priority: 'high',
        timeout: 300000, // 5 minutes
        retries: 3
      },
      code_review: {
        specialist: 'review',
        priority: 'medium',
        timeout: 180000, // 3 minutes
        retries: 1
      },
      testing: {
        specialist: 'qa',
        priority: 'high',
        timeout: 600000, // 10 minutes
        retries: 5
      },
      git_operations: {
        specialist: 'git',
        priority: 'high',
        timeout: 120000, // 2 minutes
        retries: 2
      },
      context_gathering: {
        specialist: 'context',
        priority: 'high',
        timeout: 180000, // 3 minutes
        retries: 1
      },
      deployment: {
        specialist: 'deploy',
        priority: 'critical',
        timeout: 600000, // 10 minutes
        retries: 2
      }
    };

    return rules[taskType] || {
      specialist: 'general',
      priority: 'medium',
      timeout: 300000,
      retries: 2
    };
  }
}
