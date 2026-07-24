/**
 * V2 Enhancement: Sub-Agent System
 * Purpose: Specialized AI agents for specific tasks (security, testing, documentation)
 * Integration Point: Invoked during execute and deploy phases when budget allows
 */

import { securityReviewer } from './security-reviewer.js';
import { testGenerator } from './test-generator.js';
import { documentationWriter } from './documentation-writer.js';
import logger from '../../utils/logger.js';

/**
 * Sub-agent registry with priority and budget requirements
 */
export const SUB_AGENTS = {
  'security-reviewer': {
    name: 'Security Reviewer',
    handler: securityReviewer,
    priority: 1, // Highest priority
    minTokenBudget: 500,
    description: 'Reviews code for security vulnerabilities'
  },
  'test-generator': {
    name: 'Test Generator',
    handler: testGenerator,
    priority: 2,
    minTokenBudget: 800,
    description: 'Generates unit tests for code'
  },
  'documentation-writer': {
    name: 'Documentation Writer',
    handler: documentationWriter,
    priority: 3, // Lowest priority
    minTokenBudget: 600,
    description: 'Writes inline comments and docstrings'
  }
};

/**
 * Check if sub-agents are enabled
 * @returns {boolean} True if enabled
 */
export function areSubAgentsEnabled() {
  return process.env.ENABLE_SUB_AGENTS !== 'false';
}

/**
 * Invoke a specialized sub-agent
 * @param {string} agentType - Type of sub-agent (security-reviewer, test-generator, documentation-writer)
 * @param {string} task - Task description
 * @param {Object} context - Execution context {code, filepath, plan, budgetManager}
 * @returns {Promise<Object>} Sub-agent result {success, data, message}
 */
export async function invokeSubAgent(agentType, task, context = {}) {
  try {
    // Check if sub-agents are enabled
    if (!areSubAgentsEnabled()) {
      logger.debug('Sub-agents disabled', { agentType });
      return {
        success: true,
        skipped: true,
        message: 'Sub-agents disabled'
      };
    }

    // Get sub-agent config
    const agentConfig = SUB_AGENTS[agentType];
    if (!agentConfig) {
      throw new Error(`Unknown sub-agent type: ${agentType}`);
    }

    // Check token budget if provided
    if (context.budgetManager) {
      const remaining = context.budgetManager.getRemainingBudget();
      const totalRemaining = parseInt(remaining.input) + parseInt(remaining.output);

      if (totalRemaining < agentConfig.minTokenBudget) {
        logger.warn('Insufficient token budget for sub-agent', {
          agentType,
          required: agentConfig.minTokenBudget,
          remaining: totalRemaining
        });
        return {
          success: true,
          skipped: true,
          message: `Insufficient token budget (need ${agentConfig.minTokenBudget}, have ${totalRemaining})`
        };
      }
    }

    logger.info('Invoking sub-agent', {
      type: agentType,
      name: agentConfig.name,
      task: task.substring(0, 100)
    });

    // Invoke the sub-agent handler
    const result = await agentConfig.handler(task, context);

    logger.info('Sub-agent completed', {
      type: agentType,
      success: result.success
    });

    return result;
  } catch (error) {
    logger.error('Sub-agent invocation failed', {
      agentType,
      error: error.message
    });

    // Sub-agent failures should not block main execution
    return {
      success: false,
      error: error.message,
      message: `Sub-agent ${agentType} failed: ${error.message}`
    };
  }
}

/**
 * Get list of available sub-agents sorted by priority
 * @param {Object} budgetManager - Token budget manager to check availability
 * @returns {Array} Available sub-agents
 */
export function getAvailableSubAgents(budgetManager = null) {
  const agents = Object.entries(SUB_AGENTS)
    .map(([type, config]) => ({
      type,
      ...config
    }))
    .sort((a, b) => a.priority - b.priority);

  if (!budgetManager) {
    return agents;
  }

  // Filter by token budget
  const remaining = budgetManager.getRemainingBudget();
  const totalRemaining = parseInt(remaining.input) + parseInt(remaining.output);

  return agents.filter(agent => totalRemaining >= agent.minTokenBudget);
}

export default {
  invokeSubAgent,
  getAvailableSubAgents,
  areSubAgentsEnabled,
  SUB_AGENTS
};
