import logger from '../utils/logger.js';

/**
 * Intelligent Provider Routing Engine
 *
 * Implements task-based provider selection with automatic fallback,
 * exponential backoff with jitter, and hot-swap capabilities.
 *
 * @class IntelligentProviderRouter
 */
export class IntelligentProviderRouter {
  constructor(adapter) {
    this.adapter = adapter;
    this.failureCount = new Map(); // Track failures per provider
    this.lastFailure = new Map(); // Timestamp of last failure
  }

  /**
   * Task-based provider selection with context awareness
   *
   * @param {string} taskType - 'light' | 'complex' | 'validation' | 'generation'
   * @param {number} contextSize - Estimated tokens in context
   * @returns {string} Optimal provider name
   */
  selectProvider(taskType = 'complex', contextSize = 0) {
    const ROUTING_MATRIX = {
      // Fast, cheap tasks - use smallest/fastest models
      light: ['groq', 'gemini', 'openai'],

      // Syntax/semantic validation - speed matters
      validation: ['groq', 'gemini', 'openai'],

      // Complex reasoning, architecture, design - quality matters
      complex: ['anthropic', 'gemini', 'groq'],

      // Code generation - balance quality and speed
      generation: ['anthropic', 'gemini', 'groq']
    };

    const providers = ROUTING_MATRIX[taskType] || ['gemini-pro', 'groq'];

    // Select best available provider considering:
    // 1. Provider availability
    // 2. Context window size
    // 3. Recent failure rate
    // 4. Cost optimization
    return this.selectBestAvailable(providers, contextSize);
  }

  /**
   * Select best available provider from priority list
   *
   * @param {string[]} providers - Priority-ordered provider names
   * @param {number} contextSize - Estimated tokens
   * @returns {string} Selected provider name
   */
  selectBestAvailable(providers, contextSize) {
    // Filter out providers that recently failed
    const availableProviders = providers.filter(provider => {
      const failures = this.failureCount.get(provider) || 0;
      const lastFailTime = this.lastFailure.get(provider) || 0;
      const timeSinceFailure = Date.now() - lastFailTime;

      // Reset failure count after 5 minutes
      if (timeSinceFailure > 5 * 60 * 1000) {
        this.failureCount.set(provider, 0);
        return true;
      }

      // Exclude if failed 3+ times recently
      return failures < 3;
    });

    if (availableProviders.length === 0) {
      logger.warn('All providers failed recently, resetting failure counts');
      this.failureCount.clear();
      this.lastFailure.clear();
      return providers[0]; // Fallback to first in priority list
    }

    // Find provider that fits context window
    const providerInfo = this.adapter.getProviderInfo(availableProviders[0]);
    if (!providerInfo) {
      logger.warn(`No provider info for ${availableProviders[0]}, using default`);
      return availableProviders[0];
    }

    // Check if context fits in provider's window (with 80% safety margin)
    const maxContext = providerInfo.contextWindow || 128000;
    const safeContext = Math.floor(maxContext * 0.8);

    if (contextSize > safeContext && availableProviders.length > 1) {
      logger.info('Context too large for preferred provider, trying next', {
        contextSize,
        safeContext,
        provider: availableProviders[0]
      });

      // Try next provider in list
      return this.selectBestAvailable(availableProviders.slice(1), contextSize);
    }

    const selected = availableProviders[0];
    logger.debug('Selected provider', {
      provider: selected,
      taskType: 'inferred',
      contextSize,
      availableCount: availableProviders.length
    });

    return selected;
  }

  /**
   * Execute function with exponential backoff and jitter
   *
   * Implements retry logic for rate limits:
   * - Base delay: 8 seconds
   * - Exponential: 8s, 16s, 32s
   * - Jitter: 0-1 second random addition
   * - Hot-swap to backup provider after 2 failures
   *
   * @param {Function} providerFn - Function that calls provider
   * @param {Object} options - Configuration options
   * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
   * @param {string} options.currentProvider - Current provider name
   * @param {string[]} options.fallbackProviders - Backup providers
   * @returns {Promise<any>} Provider response
   */
  async executeWithBackoff(providerFn, options = {}) {
    const {
      maxRetries = 3,
      currentProvider = 'gemini-pro',
      fallbackProviders = ['groq', 'anthropic']
    } = options;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await providerFn();

        // Success - reset failure count
        this.failureCount.set(currentProvider, 0);

        return result;

      } catch (error) {
        // Track failure
        const failures = this.failureCount.get(currentProvider) || 0;
        this.failureCount.set(currentProvider, failures + 1);
        this.lastFailure.set(currentProvider, Date.now());

        if (this.isRateLimitError(error)) {
          if (attempt < maxRetries - 1) {
            // Calculate backoff delay with jitter
            const baseDelay = 8000; // 8 seconds
            const exponential = Math.pow(2, attempt);
            const jitter = Math.random() * 1000; // 0-1 second jitter
            const delay = baseDelay * exponential + jitter;

            logger.warn('Rate limit encountered, applying exponential backoff', {
              attempt: attempt + 1,
              maxRetries,
              delay: Math.round(delay),
              provider: currentProvider,
              nextRetry: new Date(Date.now() + delay).toISOString()
            });

            await this.sleep(delay);

            // Hot-swap to backup provider after 2 failures
            if (attempt === 1 && fallbackProviders.length > 0) {
              logger.info('Switching to backup provider mid-execution', {
                from: currentProvider,
                to: fallbackProviders[0],
                reason: 'Rate limit after 2 retries'
              });

              return this.fallbackToAlternateProvider(
                providerFn,
                fallbackProviders[0],
                fallbackProviders.slice(1)
              );
            }

          } else {
            // Max retries exceeded
            logger.error('Max retries exceeded for rate limit', {
              provider: currentProvider,
              attempts: maxRetries
            });
            throw error;
          }

        } else if (this.isQuotaError(error)) {
          // Quota exceeded - immediately try fallback
          logger.error('Provider quota exceeded, switching to fallback', {
            provider: currentProvider,
            error: error.message
          });

          if (fallbackProviders.length > 0) {
            return this.fallbackToAlternateProvider(
              providerFn,
              fallbackProviders[0],
              fallbackProviders.slice(1)
            );
          } else {
            throw new Error(`Quota exceeded for ${currentProvider} and no fallback available`);
          }

        } else {
          // Other error - don't retry
          logger.error('Non-retryable error from provider', {
            provider: currentProvider,
            error: error.message
          });
          throw error;
        }
      }
    }

    throw new Error(`Failed after ${maxRetries} retries with ${currentProvider}`);
  }

  /**
   * Hot-swap to alternate provider mid-execution
   *
   * @param {Function} providerFn - Original provider function
   * @param {string} newProvider - New provider to try
   * @param {string[]} remainingFallbacks - Remaining fallback options
   * @returns {Promise<any>} Provider response
   */
  async fallbackToAlternateProvider(providerFn, newProvider, remainingFallbacks = []) {
    logger.info('Executing with alternate provider', {
      provider: newProvider,
      remainingFallbacks: remainingFallbacks.length
    });

    try {
      // Update adapter to use new provider
      this.adapter.setProvider(newProvider);

      // Execute with new provider
      const result = await providerFn();

      logger.info('Alternate provider succeeded', { provider: newProvider });
      return result;

    } catch (error) {
      logger.error('Alternate provider failed', {
        provider: newProvider,
        error: error.message
      });

      // Try next fallback if available
      if (remainingFallbacks.length > 0) {
        return this.fallbackToAlternateProvider(
          providerFn,
          remainingFallbacks[0],
          remainingFallbacks.slice(1)
        );
      } else {
        throw new Error(`All providers failed: ${error.message}`);
      }
    }
  }

  /**
   * Check if error is a rate limit error
   *
   * @param {Error} error - Error object
   * @returns {boolean} True if rate limit error
   */
  isRateLimitError(error) {
    const rateLimitPatterns = [
      /429/,
      /rate.?limit/i,
      /too.?many.?requests/i,
      /resource.?exhausted/i
    ];

    const errorString = `${error.message} ${error.status} ${error.code}`.toLowerCase();

    return rateLimitPatterns.some(pattern => pattern.test(errorString));
  }

  /**
   * Check if error is a quota exceeded error
   *
   * @param {Error} error - Error object
   * @returns {boolean} True if quota error
   */
  isQuotaError(error) {
    const quotaPatterns = [
      /quota.?exceeded/i,
      /insufficient.?quota/i,
      /billing.?not.?enabled/i,
      /quota.?limit/i
    ];

    const errorString = `${error.message} ${error.code}`.toLowerCase();

    return quotaPatterns.some(pattern => pattern.test(errorString));
  }

  /**
   * Sleep utility for backoff delays
   *
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get routing statistics for monitoring
   *
   * @returns {Object} Routing stats
   */
  getStats() {
    return {
      failureCount: Object.fromEntries(this.failureCount),
      lastFailure: Object.fromEntries(
        Array.from(this.lastFailure.entries()).map(([k, v]) => [
          k,
          new Date(v).toISOString()
        ])
      )
    };
  }

  /**
   * Reset all failure tracking
   */
  reset() {
    this.failureCount.clear();
    this.lastFailure.clear();
    logger.info('Routing engine reset');
  }
}

export default IntelligentProviderRouter;
