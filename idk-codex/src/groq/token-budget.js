/**
 * V2 Enhancement: Token Budget Manager
 * Purpose: Track and enforce token budgets to prevent context overflow
 * Integration Point: Used in agent loop and Groq client
 *
 * V3 (context-window-aware): The manager can be told the active model's
 * context window and max-output reservation, and will set its input/output
 * limits accordingly. Legacy env overrides (`TOKEN_INPUT_LIMIT`,
 * `TOKEN_OUTPUT_LIMIT`) still win for backward compatibility, but if those
 * are not set the limits come from the model's context window.
 */

import logger from '../utils/logger.js';
import { resolveModel } from '../llm/model-registry.js';

const DEFAULT_CONTEXT_WINDOW = parseInt(process.env.DEFAULT_CONTEXT_WINDOW || '128000', 10);
const DEFAULT_OUTPUT_RESERVE = parseInt(process.env.DEFAULT_MAX_OUTPUT_TOKENS || '4096', 10);

/**
 * Manages token budgets for AI API calls
 */
export class TokenBudgetManager {
  /**
   * Create a new token budget manager
   * @param {Object} options - Budget options
   * @param {number} [options.contextWindow] - Model context window in tokens
   * @param {number} [options.outputReserve] - Tokens reserved for output
   * @param {number} [options.inputLimit] - Hard input limit (overrides ctx-derived)
   * @param {number} [options.outputLimit] - Hard output limit (overrides ctx-derived)
   */
  constructor(options = {}) {
    // Resolve the active model's context window (if a model id was passed)
    let contextWindow = options.contextWindow || DEFAULT_CONTEXT_WINDOW;
    let outputReserve = options.outputReserve || DEFAULT_OUTPUT_RESERVE;

    if (options.modelId) {
      const resolved = resolveModel(options.modelId);
      if (resolved?.contextWindow) contextWindow = resolved.contextWindow;
      if (resolved?.maxOutputTokens) outputReserve = resolved.maxOutputTokens;
    }

    // Env overrides win for backward compatibility
    this.inputLimit = parseInt(
      process.env.TOKEN_INPUT_LIMIT || options.inputLimit || String(contextWindow - outputReserve),
      10
    );
    this.outputLimit = parseInt(
      process.env.TOKEN_OUTPUT_LIMIT || options.outputLimit || String(outputReserve),
      10
    );
    this.handoffThreshold = parseFloat(process.env.HANDOFF_TOKEN_THRESHOLD || '0.8');

    // Remember the model context so callers can re-derive budgets if needed
    this.contextWindow = contextWindow;
    this.outputReserve = outputReserve;

    this.currentInput = 0;
    this.currentOutput = 0;

    logger.info('Token budget manager initialized', {
      contextWindow,
      outputReserve,
      inputLimit: this.inputLimit,
      outputLimit: this.outputLimit,
      handoffThreshold: this.handoffThreshold
    });
  }

  /**
   * Update the context window for the current model. Useful when the agent
   * switches providers mid-task.
   * @param {number} contextWindow
   * @param {number} [outputReserve]
   */
  setModel(contextWindow, outputReserve = null) {
    this.contextWindow = contextWindow;
    if (outputReserve !== null) this.outputReserve = outputReserve;

    // Re-derive limits unless env overrides are set
    if (!process.env.TOKEN_INPUT_LIMIT) {
      this.inputLimit = contextWindow - this.outputReserve;
    }
    if (!process.env.TOKEN_OUTPUT_LIMIT) {
      this.outputLimit = this.outputReserve;
    }

    logger.info('Token budget manager model updated', {
      contextWindow: this.contextWindow,
      outputReserve: this.outputReserve,
      inputLimit: this.inputLimit,
      outputLimit: this.outputLimit
    });
  }

  /**
   * Check if budget allows for new tokens
   * @param {number} estimatedInput - Estimated input tokens
   * @param {number} estimatedOutput - Estimated output tokens
   * @returns {Object} Check result {allowed, reason}
   */
  checkBudget(estimatedInput = 0, estimatedOutput = 0) {
    const wouldExceedInput = (this.currentInput + estimatedInput) > this.inputLimit;
    const wouldExceedOutput = (this.currentOutput + estimatedOutput) > this.outputLimit;

    if (wouldExceedInput) {
      return {
        allowed: false,
        reason: `Would exceed input token limit (${this.currentInput + estimatedInput}/${this.inputLimit})`
      };
    }

    if (wouldExceedOutput) {
      return {
        allowed: false,
        reason: `Would exceed output token limit (${this.currentOutput + estimatedOutput}/${this.outputLimit})`
      };
    }

    return { allowed: true };
  }

  /**
   * Add token usage to current totals
   * @param {number} inputTokens - Input tokens used
   * @param {number} outputTokens - Output tokens used
   */
  addUsage(inputTokens, outputTokens) {
    this.currentInput += inputTokens || 0;
    this.currentOutput += outputTokens || 0;

    logger.info('Token usage updated', {
      inputTokens,
      outputTokens,
      totalInput: this.currentInput,
      totalOutput: this.currentOutput,
      inputPercentage: ((this.currentInput / this.inputLimit) * 100).toFixed(1) + '%',
      outputPercentage: ((this.currentOutput / this.outputLimit) * 100).toFixed(1) + '%'
    });
  }

  /**
   * Get remaining token budget
   * @returns {Object} Remaining budget {input, output, inputPercent, outputPercent}
   */
  getRemainingBudget() {
    const remainingInput = Math.max(0, this.inputLimit - this.currentInput);
    const remainingOutput = Math.max(0, this.outputLimit - this.currentOutput);

    return {
      input: remainingInput,
      output: remainingOutput,
      inputPercent: ((this.currentInput / this.inputLimit) * 100).toFixed(1),
      outputPercent: ((this.currentOutput / this.outputLimit) * 100).toFixed(1)
    };
  }

  /**
   * Check if handoff should be triggered based on token usage
   * @returns {boolean} True if handoff should be triggered
   */
  shouldTriggerHandoff() {
    const inputUsagePercent = this.currentInput / this.inputLimit;
    const outputUsagePercent = this.currentOutput / this.outputLimit;

    const shouldHandoff = inputUsagePercent >= this.handoffThreshold ||
                          outputUsagePercent >= this.handoffThreshold;

    if (shouldHandoff) {
      logger.warn('Token budget handoff threshold reached', {
        inputUsagePercent: (inputUsagePercent * 100).toFixed(1) + '%',
        outputUsagePercent: (outputUsagePercent * 100).toFixed(1) + '%',
        threshold: (this.handoffThreshold * 100).toFixed(1) + '%'
      });
    }

    return shouldHandoff;
  }

  /**
   * Reset token counters (for new sessions)
   */
  reset() {
    logger.info('Resetting token budget counters');
    this.currentInput = 0;
    this.currentOutput = 0;
  }

  /**
   * Get current usage summary
   * @returns {Object} Usage summary
   */
  getUsageSummary() {
    return {
      contextWindow: this.contextWindow,
      outputReserve: this.outputReserve,
      input: {
        used: this.currentInput,
        limit: this.inputLimit,
        remaining: this.inputLimit - this.currentInput,
        percent: ((this.currentInput / this.inputLimit) * 100).toFixed(1)
      },
      output: {
        used: this.currentOutput,
        limit: this.outputLimit,
        remaining: this.outputLimit - this.currentOutput,
        percent: ((this.currentOutput / this.outputLimit) * 100).toFixed(1)
      },
      total: {
        used: this.currentInput + this.currentOutput,
        limit: this.inputLimit + this.outputLimit,
        percent: (((this.currentInput + this.currentOutput) / (this.inputLimit + this.outputLimit)) * 100).toFixed(1)
      }
    };
  }
}

export default TokenBudgetManager;
