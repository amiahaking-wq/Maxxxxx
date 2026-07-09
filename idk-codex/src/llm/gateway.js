/**
 * Multi-SDK Gateway
 *
 * Unified gateway wrapping existing adapter.js with enhanced routing:
 * - Google Gen AI Path: High-context tasks (architecture, cross-file analysis)
 * - OpenAI-Compatible Gateway: Flexible wrapper for Groq/Together AI/OpenRouter
 * - Mobile Reverse WebSocket: Placeholder for local phone inference
 *
 * Integrates with TokenBudgetManager and implements 429 backoff for free-tier resiliency.
 */

import adapter from './adapter.js';
import phoneBridge from '../interfaces/phone-bridge.js';
import { GeminiProvider } from './providers/gemini.js';
import { GroqProvider } from './providers/groq.js';
import { AnthropicProvider } from './providers/anthropic.js';
import logger from '../utils/logger.js';
import { isRufloReady } from '../agent/max/ruflo-setup.js';

/**
 * Task type routing matrix
 */
const ROUTING_MATRIX = {
  // High-context tasks → Gemini Pro (2M context window)
  'architecture': { provider: 'gemini', reason: 'Large context needed for architecture analysis' },
  'cross-file': { provider: 'gemini', reason: 'Multiple file analysis requires large context' },
  'error-postmortem': { provider: 'gemini', reason: 'Deep context needed for error analysis' },
  'documentation': { provider: 'gemini', reason: 'Requires understanding full codebase context' },

  // Fast generation tasks → Groq (fast inference)
  'code-generation': { provider: 'groq', reason: 'Fast inference for code generation' },
  'validation': { provider: 'groq', reason: 'Quick validation checks' },
  'light': { provider: 'groq', reason: 'Lightweight task optimized for speed' },

  // High-quality tasks → Anthropic Claude
  'planning': { provider: 'anthropic', reason: 'Complex reasoning and planning' },
  'review': { provider: 'anthropic', reason: 'High-quality code review' },
  'complex': { provider: 'anthropic', reason: 'Complex reasoning required' }
};

/**
 * Multi-SDK Gateway for intelligent LLM routing
 */
export class MultiSDKGateway {
  constructor() {
    this.adapter = adapter;
    this.mobileWebSocket = null;
    this.routingMode = process.env.MAX_DEFAULT_MODEL_ROUTE || 'autonomous';
    this.enableMobileInference = process.env.MAX_ENABLE_MOBILE_INFERENCE === 'true';
    this.retryDelay = 1000; // Initial retry delay in ms
    this.maxRetries = 3;
  }

  /**
   * Initialize the gateway
   */
  initialize() {
    this.adapter.initialize();

    if (this.enableMobileInference) {
      this.initializeMobileWebSocket();
    }

    logger.info('Multi-SDK Gateway initialized', {
      routingMode: this.routingMode,
      mobileInference: this.enableMobileInference,
      providers: this.adapter.getAvailableProviders().map(p => p.name)
    });
  }

  /**
   * Initialize mobile WebSocket for local phone inference
   * Placeholder for future implementation
   */
  initializeMobileWebSocket() {
    const port = process.env.MAX_MOBILE_WEBSOCKET_PORT || 8765;

    logger.info('Mobile inference WebSocket initialized (placeholder)', {
      port,
      status: 'awaiting connection'
    });

    // TODO: Implement WebSocket server for mobile inference
    // This would allow routing prompts to a local phone running
    // a lightweight LLM (e.g., Llama 3.2 on iOS/Android)
  }

  /**
   * Create completion with intelligent routing
   *
   * RUFLO INTEGRATION POINT:
   * - When RUFLO_ENABLED=true and ruflo daemon is running, high-level goals
   *   can be routed through the ruflo swarm for multi-agent coordination
   * - This happens at the controller level (not here), but gateway provides
   *   fallback routing when ruflo is unavailable
   *
   * @param {Object} options - Completion options
   * @param {Array} options.messages - Chat messages
   * @param {number} options.temperature - Sampling temperature
   * @param {number} options.maxTokens - Max output tokens
   * @param {string} options.taskType - Task type for routing
   * @param {string} options.forceProvider - Force specific provider
   * @param {Object} options.budgetManager - Token budget manager
   * @param {boolean} options.useRuflo - Whether to attempt ruflo routing (set by controller)
   * @returns {Promise<Object>} Completion result
   */
  async createCompletion(options) {
    const {
      messages,
      temperature = 0.3,
      maxTokens = 2000,
      taskType = 'complex',
      forceProvider = null,
      budgetManager = null,
      useRuflo = false
    } = options;

    // Check budget if provided
    if (budgetManager) {
      const budgetCheck = budgetManager.checkBudget(0, maxTokens);
      if (!budgetCheck.allowed) {
        throw new Error(`Token budget exceeded: ${budgetCheck.reason}`);
      }
    }

    try {
      // Ruflo integration: Check if high-level goal should use swarm coordination
      // Note: Actual ruflo routing happens at controller.js level
      // This is just for logging/awareness
      if (useRuflo && isRufloReady()) {
        logger.debug('Task eligible for ruflo swarm routing', {
          taskType,
          rufloEnabled: true
        });
      }

      // Determine provider based on routing mode
      let selectedProvider = null;

      if (forceProvider) {
        // Forced provider (e.g., from frontend toggle)
        selectedProvider = forceProvider;
        logger.info('Using forced provider', { provider: forceProvider });

      } else if (this.routingMode === 'force-gemini') {
        // Force Gemini Pro mode
        selectedProvider = 'gemini';

      } else if (this.routingMode === 'force-mobile' && this.enableMobileInference) {
        // Force local phone model (if available)
        return await this.routeToMobile(messages, temperature, maxTokens, budgetManager);

      } else if (this.routingMode === 'autonomous') {
        // Autonomous engine routing based on task type
        const route = ROUTING_MATRIX[taskType];
        if (route) {
          selectedProvider = route.provider;
          logger.debug('Autonomous routing', {
            taskType,
            selectedProvider,
            reason: route.reason
          });
        }
      }

      // Set provider if determined
      if (selectedProvider && this.adapter.providers.some(p => p.name === selectedProvider)) {
        this.adapter.setProvider(selectedProvider);
      }

      // Create completion with exponential backoff on 429
      const result = await this.createCompletionWithBackoff({
        messages,
        temperature,
        maxTokens,
        taskType
      });

      // Track token usage if budget manager provided
      if (budgetManager && result.usage) {
        budgetManager.addUsage(
          result.usage.prompt_tokens || 0,
          result.usage.completion_tokens || 0
        );
      }

      return result;

    } catch (error) {
      logger.error('Gateway completion failed', {
        error: error.message,
        taskType,
        routingMode: this.routingMode
      });
      throw error;
    }
  }

  /**
   * Create completion with exponential backoff for 429 errors
   *
   * @param {Object} options - Completion options
   * @returns {Promise<Object>} Completion result
   */
  async createCompletionWithBackoff(options, attempt = 1) {
    try {
      return await this.adapter.createCompletion(options);

    } catch (error) {
      // Check if error is rate limit (429)
      const isRateLimit = error.message.includes('429') ||
                          error.message.toLowerCase().includes('rate limit') ||
                          error.message.toLowerCase().includes('quota');

      if (isRateLimit && attempt <= this.maxRetries) {
        // Calculate exponential backoff with jitter
        const baseDelay = this.retryDelay * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;

        logger.warn('Rate limit hit, retrying with backoff', {
          attempt,
          delayMs: Math.round(delay),
          provider: this.adapter.currentProvider?.name
        });

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));

        // Try next provider on retry if available
        if (this.adapter.providers.length > 1) {
          const currentIndex = this.adapter.providers.findIndex(
            p => p.name === this.adapter.currentProvider?.name
          );
          const nextIndex = (currentIndex + 1) % this.adapter.providers.length;
          const nextProvider = this.adapter.providers[nextIndex];

          logger.info('Switching to fallback provider', {
            from: this.adapter.currentProvider?.name,
            to: nextProvider.name
          });

          this.adapter.setProvider(nextProvider.name);
        }

        return await this.createCompletionWithBackoff(options, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Route to mobile phone inference (placeholder)
   *
   * @param {Array} messages - Chat messages
   * @param {number} temperature - Sampling temperature
   * @param {number} maxTokens - Max output tokens
   * @returns {Promise<Object>} Completion result
   */
  async routeToMobile(messages, temperature, maxTokens, budgetManager = null) {
    logger.info('Routing to mobile phone inference');

    if (!this.adapter.providers.some(p => p.name === 'phone')) {
      this.adapter.providers.push(new (await import('./providers/phone.js')).PhoneProvider(phoneBridge));
    }

    this.adapter.setProvider('phone');

    return await this.adapter.createCompletion({
      messages,
      temperature,
      maxTokens,
      budgetManager
    });
  }

  /**
   * Set routing mode
   *
   * @param {string} mode - Routing mode ('autonomous', 'force-gemini', 'force-mobile')
   */
  setRoutingMode(mode) {
    const validModes = ['autonomous', 'force-gemini', 'force-mobile'];

    if (!validModes.includes(mode)) {
      throw new Error(`Invalid routing mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
    }

    this.routingMode = mode;
    logger.info('Routing mode changed', { mode });
  }

  /**
   * Get gateway status
   *
   * @returns {Object} Gateway status
   */
  getStatus() {
    return {
      routingMode: this.routingMode,
      mobileInference: {
        enabled: this.enableMobileInference,
        connected: this.mobileWebSocket?.connected || false
      },
      providers: this.adapter.getAvailableProviders(),
      currentProvider: this.adapter.currentProvider?.name
    };
  }

  /**
   * Get routing matrix for task types
   *
   * @returns {Object} Routing matrix
   */
  getRoutingMatrix() {
    return ROUTING_MATRIX;
  }
}

// Singleton instance
const gateway = new MultiSDKGateway();

/**
 * Convenience function for creating completions through gateway
 */
export async function gatewayCompletion(options) {
  if (!gateway.adapter.initialized) {
    gateway.initialize();
  }
  return gateway.createCompletion(options);
}

/**
 * Get gateway instance
 */
export function getGateway() {
  if (!gateway.adapter.initialized) {
    gateway.initialize();
  }
  return gateway;
}

export default gateway;
