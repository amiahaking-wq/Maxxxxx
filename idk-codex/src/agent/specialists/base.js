import logger from '../../utils/logger.js';

/**
 * Base class for all specialist agents
 *
 * Specialists are focused agents that handle specific types of tasks:
 * - Git Specialist: GitHub operations, commits, PRs
 * - Coding Specialist: Code generation and implementation
 * - Review Specialist: Code review and compliance checking
 * - Context Specialist: Information gathering and analysis
 * - QA Specialist: Testing and quality assurance
 *
 * Based on Claude Code's specialist architecture
 */
export class SpecialistAgent {
  constructor(name, capabilities, description = '') {
    this.name = name;
    this.capabilities = capabilities;
    this.description = description;
  }

  /**
   * Execute the specialist's task
   * Must be implemented by subclasses
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(task, context) {
    throw new Error(`${this.name} specialist must implement execute() method`);
  }

  /**
   * Check if this specialist can handle the given task
   *
   * @param {string|Object} task - Task description or object
   * @returns {boolean} True if specialist can handle the task
   */
  canHandle(task) {
    const taskStr = typeof task === 'string' ? task.toLowerCase() : task.description?.toLowerCase() || '';

    return this.capabilities.some(capability => {
      const capLower = capability.toLowerCase();
      return taskStr.includes(capLower);
    });
  }

  /**
   * Get specialist information
   *
   * @returns {Object} Specialist metadata
   */
  getInfo() {
    return {
      name: this.name,
      capabilities: this.capabilities,
      description: this.description
    };
  }

  /**
   * Log specialist activity
   *
   * @param {string} action - Action being performed
   * @param {Object} details - Additional details
   */
  log(action, details = {}) {
    logger.info(`[${this.name}] ${action}`, details);
  }

  /**
   * Log specialist error
   *
   * @param {string} action - Action that failed
   * @param {Error} error - Error object
   * @param {Object} details - Additional details
   */
  logError(action, error, details = {}) {
    logger.error(`[${this.name}] ${action} failed`, {
      error: error.message,
      ...details
    });
  }

  /**
   * Validate required context fields
   *
   * @param {Object} context - Context object
   * @param {Array<string>} requiredFields - Required field names
   * @throws {Error} If required fields are missing
   */
  validateContext(context, requiredFields) {
    const missing = requiredFields.filter(field => !context[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required context fields: ${missing.join(', ')}`);
    }
  }

  /**
   * Create a success result
   *
   * @param {Object} data - Result data
   * @param {string} message - Success message
   * @returns {Object} Success result object
   */
  success(data = {}, message = 'Operation completed successfully') {
    return {
      success: true,
      specialist: this.name,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create a failure result
   *
   * @param {string} error - Error message
   * @param {Object} details - Additional error details
   * @returns {Object} Failure result object
   */
  failure(error, details = {}) {
    return {
      success: false,
      specialist: this.name,
      error,
      details,
      timestamp: new Date().toISOString()
    };
  }
}
