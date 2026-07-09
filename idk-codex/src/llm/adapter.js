/**
 * Unified LLM Adapter
 * Supports automatic provider selection and fallback
 * Providers: Groq, Anthropic (Claude), Google (Gemini)
 */

import { GroqProvider } from './providers/groq.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { IntelligentProviderRouter } from './routing-engine.js';
import logger from '../utils/logger.js';

class LLMAdapter {
  constructor() {
    this.providers = [];
    this.currentProvider = null;
    this.initialized = false;
    this.router = null; // Intelligent routing engine (initialized after providers)
  }

  /**
   * Initialize providers based on available API keys
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing LLM Adapter');

    // Get provider priority from env or use default
    const priorityList = (process.env.LLM_PROVIDER_PRIORITY || 'groq,anthropic,gemini')
      .split(',')
      .map(p => p.trim());

    // Initialize providers in priority order
    for (const providerName of priorityList) {
      try {
        switch (providerName) {
          case 'groq':
            if (process.env.GROQ_API_KEY) {
              this.providers.push(new GroqProvider(process.env.GROQ_API_KEY));
              logger.info('✓ Groq provider initialized');
            }
            break;
          case 'anthropic':
            if (process.env.ANTHROPIC_API_KEY) {
              this.providers.push(new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
              logger.info('✓ Anthropic provider initialized');
            }
            break;
          case 'gemini':
            if (process.env.GOOGLE_GEMINI_API_KEY) {
              this.providers.push(new GeminiProvider(process.env.GOOGLE_GEMINI_API_KEY));
              logger.info('✓ Gemini provider initialized');
            }
            break;
        }
      } catch (error) {
        logger.warn(`Failed to initialize ${providerName} provider`, {
          error: error.message
        });
      }
    }

    if (this.providers.length === 0) {
      throw new Error('No LLM providers available. Please set at least one API key.');
    }

    // Set default provider
    this.currentProvider = this.providers[0];

    // Initialize intelligent routing engine
    this.router = new IntelligentProviderRouter(this);

    logger.info('LLM Adapter ready', {
      availableProviders: this.providers.map(p => p.name),
      currentProvider: this.currentProvider.name,
      routingEngine: 'enabled'
    });

    this.initialized = true;
  }

  /**
   * Get current provider
   */
  getCurrentProvider() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.currentProvider;
  }

  /**
   * Set current provider by name
   */
  setProvider(providerName) {
    if (!this.initialized) {
      this.initialize();
    }

    const provider = this.providers.find(p => p.name === providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not available`);
    }

    this.currentProvider = provider;
    logger.info('Switched to provider', { provider: providerName });
  }

  /**
   * Create chat completion with intelligent routing and automatic fallback
   *
   * Enhanced in v2.0 with:
   * - Task-based provider selection
   * - Exponential backoff with jitter for rate limits
   * - Hot-swap to backup providers
   *
   * @param {Object} options - Completion options
   * @param {Array} options.messages - Chat messages
   * @param {number} options.temperature - Sampling temperature
   * @param {number} options.maxTokens - Max output tokens
   * @param {string} options.taskType - 'light' | 'complex' | 'validation' | 'generation'
   * @returns {Promise<Object>} Completion result
   */
  async createCompletion(options) {
    if (!this.initialized) {
      this.initialize();
    }

    // Use intelligent routing if taskType provided
    const useIntelligentRouting = process.env.LLM_USE_INTELLIGENT_ROUTING !== 'false';
    const taskType = options.taskType || 'complex';

    if (useIntelligentRouting && this.router) {
      // Estimate context size
      const contextSize = this.estimateContextSize(options.messages || []);

      // Select optimal provider
      const selectedProviderName = this.router.selectProvider(taskType, contextSize);
      const selectedProvider = this.providers.find(p => p.name === selectedProviderName);

      if (selectedProvider) {
        this.currentProvider = selectedProvider;

        logger.debug('Using intelligent routing', {
          taskType,
          contextSize,
          selectedProvider: selectedProviderName
        });

        // Execute with exponential backoff and fallback
        const fallbackProviders = this.providers
          .filter(p => p.name !== selectedProviderName)
          .map(p => p.name);

        try {
          return await this.router.executeWithBackoff(
            () => selectedProvider.createCompletion(options),
            {
              currentProvider: selectedProviderName,
              fallbackProviders,
              maxRetries: 3
            }
          );
        } catch (error) {
          logger.error('Intelligent routing failed', {
            error: error.message,
            taskType,
            provider: selectedProviderName
          });

          // Fall through to legacy fallback logic
        }
      }
    }

    // Legacy fallback logic (preserved for compatibility)
    const autoFallback = process.env.LLM_AUTO_FALLBACK !== 'false';
    const maxAttempts = autoFallback ? this.providers.length : 1;

    let lastError = null;
    let attemptedProviders = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const provider = this.providers[attempt] || this.currentProvider;
      attemptedProviders.push(provider.name);

      try {
        logger.debug('Attempting completion', {
          provider: provider.name,
          attempt: attempt + 1,
          maxAttempts
        });

        const result = await provider.createCompletion(options);

        // Success - update current provider for next call
        this.currentProvider = provider;

        return result;
      } catch (error) {
        lastError = error;
        logger.warn('Provider completion failed', {
          provider: provider.name,
          error: error.message,
          attempt: attempt + 1
        });

        // Check if we should retry with next provider
        if (attempt < maxAttempts - 1) {
          logger.info('Falling back to next provider', {
            from: provider.name,
            to: this.providers[attempt + 1]?.name
          });
        }
      }
    }

    // All providers failed
    logger.error('All LLM providers failed', {
      attemptedProviders,
      lastError: lastError?.message
    });

    throw new Error(
      `All LLM providers failed. Attempted: ${attemptedProviders.join(', ')}. Last error: ${lastError?.message}`
    );
  }

  /**
   * Estimate context size in tokens
   *
   * @param {Array} messages - Chat messages
   * @returns {number} Estimated token count
   */
  estimateContextSize(messages) {
    if (!messages || messages.length === 0) {
      return 0;
    }

    // Simple heuristic: ~4 characters per token
    const totalChars = messages.reduce(
      (sum, msg) => sum + (msg.content?.length || 0),
      0
    );

    return Math.ceil(totalChars / 4);
  }

  /**
   * Select best provider for context size
   */
  selectProviderForContext(messages) {
    if (!this.initialized) {
      this.initialize();
    }

    // Find provider that can fit the context
    for (const provider of this.providers) {
      if (provider.fitsInContext(messages)) {
        logger.debug('Selected provider for context', {
          provider: provider.name,
          messageCount: messages.length
        });
        return provider;
      }
    }

    // Default to current provider if none found
    logger.warn('No provider fits context perfectly, using current provider');
    return this.currentProvider;
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.providers.map(p => ({
      name: p.name,
      models: Object.keys(p.models),
      defaultModel: p.defaultModel
    }));
  }

  /**
   * Get provider info
   */
  getProviderInfo(providerName = null) {
    if (!this.initialized) {
      this.initialize();
    }

    const provider = providerName
      ? this.providers.find(p => p.name === providerName)
      : this.currentProvider;

    if (!provider) {
      return null;
    }

    return {
      name: provider.name,
      models: provider.models,
      defaultModel: provider.defaultModel
    };
  }
}

// Singleton instance
const adapter = new LLMAdapter();

/**
 * Convenience function for creating completions
 */
export async function completion(options) {
  return adapter.createCompletion(options);
}

/**
 * Get current provider
 */
export function getCurrentProvider() {
  return adapter.getCurrentProvider();
}

/**
 * Set provider
 */
export function setProvider(providerName) {
  adapter.setProvider(providerName);
}

/**
 * Get available providers
 */
export function getAvailableProviders() {
  return adapter.getAvailableProviders();
}

/**
 * Get provider info
 */
export function getProviderInfo(providerName = null) {
  return adapter.getProviderInfo(providerName);
}

export default adapter;
export { adapter };
