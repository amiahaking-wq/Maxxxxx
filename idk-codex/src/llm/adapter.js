/**
 * Unified LLM Adapter
 * Supports automatic provider selection and fallback across cloud and local models
 * Providers: Groq, Anthropic, Gemini, OpenAI-compatible, Ollama
 */

import { GroqProvider } from './providers/groq.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.js';
import { OllamaProvider } from './providers/ollama.js';
import { PhoneProvider } from './providers/phone.js';
import phoneBridge from '../interfaces/phone-bridge.js';
import { resolveModel, getModelOptions } from './model-registry.js';
import { IntelligentProviderRouter } from './routing-engine.js';
import logger from '../utils/logger.js';

class LLMAdapter {
  constructor() {
    this.providers = [];
    this.currentProvider = null;
    this.currentModel = null;
    this.initialized = false;
    this.router = null;
  }

  /**
   * Initialize providers based on available API keys and endpoints
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing LLM Adapter');

    const priorityList = (process.env.LLM_PROVIDER_PRIORITY || 'ollama,openai,openai-compatible,groq,anthropic,gemini,phone')
      .split(',')
      .map(p => p.trim())
      .filter(p => p);

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
          case 'google':
            if (process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY) {
              this.providers.push(new GeminiProvider(process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY));
              logger.info('✓ Gemini provider initialized');
            }
            break;

          case 'openai':
            if (process.env.OPENAI_API_KEY) {
              this.providers.push(new OpenAICompatibleProvider({
                name: 'openai',
                baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                apiKey: process.env.OPENAI_API_KEY,
                defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                models: [
                  { id: process.env.OPENAI_MODEL || 'gpt-4o-mini', maxTokens: 16384, contextWindow: 128000 },
                  { id: 'gpt-4o', maxTokens: 16384, contextWindow: 128000 },
                  { id: 'gpt-4o-mini', maxTokens: 16384, contextWindow: 128000 }
                ]
              }));
              logger.info('✓ OpenAI provider initialized');
            }
            break;

          case 'openai-compatible':
            if (process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_COMPATIBLE_API_KEY) {
              this.providers.push(new OpenAICompatibleProvider({
                name: 'openai-compatible',
                baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL || 'http://localhost:8000/v1',
                apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
                defaultModel: process.env.OPENAI_COMPATIBLE_MODEL || 'default',
                models: [
                  { id: process.env.OPENAI_COMPATIBLE_MODEL || 'default', maxTokens: 8192, contextWindow: 8192 }
                ]
              }));
              logger.info('✓ OpenAI-compatible provider initialized');
            }
            break;

          case 'local':
            if (process.env.LOCAL_API_BASE_URL) {
              this.providers.push(new OpenAICompatibleProvider({
                name: 'local',
                baseURL: process.env.LOCAL_API_BASE_URL,
                apiKey: process.env.LOCAL_API_KEY || '',
                defaultModel: process.env.LOCAL_MODEL || 'default',
                models: [
                  { id: process.env.LOCAL_MODEL || 'default', maxTokens: 8192, contextWindow: 8192 }
                ]
              }));
              logger.info('✓ Local provider initialized');
            }
            break;

          case 'ollama':
            if (process.env.OLLAMA_HOST) {
              this.providers.push(new OllamaProvider({
                host: process.env.OLLAMA_HOST,
                model: process.env.OLLAMA_MODEL,
                models: [
                  { id: process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b', maxTokens: 8192, contextWindow: 8192 }
                ]
              }));
              logger.info('✓ Ollama provider initialized');
            }
            break;

          case 'phone':
            this.providers.push(new PhoneProvider(phoneBridge));
            logger.info('✓ Phone provider initialized (waiting for device connection)');
            break;
        }
      } catch (error) {
        logger.warn(`Failed to initialize ${providerName} provider`, {
          error: error.message
        });
      }
    }

    if (this.providers.length === 0) {
      throw new Error('No LLM providers available. Please set at least one provider: OPENAI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GEMINI_API_KEY, OLLAMA_HOST, OPENAI_COMPATIBLE_BASE_URL, or LOCAL_API_BASE_URL.');
    }

    // Set default provider (first in priority list that was successfully initialized)
    this.currentProvider = this.providers[0];
    this.currentModel = this.currentProvider.defaultModel;

    this.router = new IntelligentProviderRouter(this);

    logger.info('LLM Adapter ready', {
      availableProviders: this.providers.map(p => p.name),
      currentProvider: this.currentProvider.name,
      currentModel: this.currentModel,
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
   * Set current provider by name or model ID
   */
  setProvider(providerName) {
    if (!this.initialized) {
      this.initialize();
    }

    if (!providerName) {
      return;
    }

    // Try to resolve as a model ID first
    const resolved = resolveModel(providerName);
    if (resolved) {
      const provider = this.providers.find(p => p.name === resolved.provider);
      if (provider) {
        this.currentProvider = provider;
        this.currentModel = resolved.model;
        logger.info('Switched to provider/model', { provider: resolved.provider, model: resolved.model });
        return;
      }
    }

    // Otherwise treat as a provider name
    const provider = this.providers.find(p => p.name === providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not available`);
    }

    this.currentProvider = provider;
    this.currentModel = provider.defaultModel;
    logger.info('Switched to provider', { provider: providerName });
  }

  /**
   * Set explicit model (actual model name, not model ID)
   */
  setModel(model) {
    if (!this.initialized) {
      this.initialize();
    }
    this.currentModel = model;
    logger.info('Set current model', { model });
  }

  /**
   * Resolve a model identifier to a provider and actual model name
   */
  resolveModelAndProvider(modelIdOrName) {
    if (!modelIdOrName) {
      return { provider: this.currentProvider, model: this.currentModel };
    }

    const resolved = resolveModel(modelIdOrName);
    if (resolved) {
      const provider = this.providers.find(p => p.name === resolved.provider);
      if (provider) {
        return { provider, model: resolved.model };
      }
    }

    // If not a known ID, pass the raw string as a model name with current provider
    return { provider: this.currentProvider, model: modelIdOrName };
  }

  /**
   * Create chat completion with intelligent routing and automatic fallback
   */
  async createCompletion(options) {
    if (!this.initialized) {
      this.initialize();
    }

    const optionsCopy = { ...options };

    // Normalize maxTokens -> max_tokens
    if (optionsCopy.maxTokens && !optionsCopy.max_tokens) {
      optionsCopy.max_tokens = optionsCopy.maxTokens;
    }

    // Resolve model if provided
    if (optionsCopy.model) {
      const resolved = this.resolveModelAndProvider(optionsCopy.model);
      this.currentProvider = resolved.provider;
      this.currentModel = resolved.model;
      optionsCopy.model = resolved.model;
    } else {
      optionsCopy.model = this.currentModel || this.currentProvider.defaultModel;
    }

    // Use intelligent routing if explicitly enabled (disabled by default to avoid routing errors)
    const useIntelligentRouting = process.env.LLM_USE_INTELLIGENT_ROUTING === 'true';
    const taskType = optionsCopy.taskType || 'complex';

    if (useIntelligentRouting && this.router) {
      const contextSize = this.estimateContextSize(optionsCopy.messages || []);
      const selectedProviderName = this.router.selectProvider(taskType, contextSize);
      const selectedProvider = this.providers.find(p => p.name === selectedProviderName);

      if (selectedProvider) {
        this.currentProvider = selectedProvider;
        optionsCopy.model = this.currentProvider.defaultModel;

        logger.debug('Using intelligent routing', {
          taskType,
          contextSize,
          selectedProvider: selectedProviderName
        });

        const fallbackProviders = this.providers
          .filter(p => p.name !== selectedProviderName)
          .map(p => p.name);

        try {
          return await this.router.executeWithBackoff(
            () => selectedProvider.createCompletion(optionsCopy),
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
        }
      }
    }

    // Legacy fallback logic
    const autoFallback = process.env.LLM_AUTO_FALLBACK !== 'false';
    const maxAttempts = autoFallback ? this.providers.length : 1;

    // Start fallback from the currently selected provider
    const currentProviderIndex = this.providers.findIndex(p => p.name === this.currentProvider?.name);
    const startIndex = currentProviderIndex >= 0 ? currentProviderIndex : 0;

    let lastError = null;
    const attemptedProviders = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const providerIndex = (startIndex + attempt) % this.providers.length;
      const provider = this.providers[providerIndex] || this.currentProvider;
      attemptedProviders.push(provider.name);

      try {
        logger.debug('Attempting completion', {
          provider: provider.name,
          attempt: attempt + 1,
          maxAttempts
        });

        const attemptOptions = {
          ...optionsCopy,
          model: provider === this.currentProvider ? optionsCopy.model : provider.defaultModel
        };

        const result = await provider.createCompletion(attemptOptions);
        this.currentProvider = provider;
        this.currentModel = result.model || provider.defaultModel;

        return result;
      } catch (error) {
        lastError = error;
        logger.warn('Provider completion failed', {
          provider: provider.name,
          error: error.message,
          attempt: attempt + 1
        });

        if (attempt < maxAttempts - 1) {
          const nextIndex = (startIndex + attempt + 1) % this.providers.length;
          logger.info('Falling back to next provider', {
            from: provider.name,
            to: this.providers[nextIndex]?.name
          });
        }
      }
    }

    logger.error('All LLM providers failed', {
      attemptedProviders,
      lastError: lastError?.message
    });

    throw new Error(
      `All LLM providers failed. Attempted: ${attemptedProviders.join(', ')}. Last error: ${lastError?.message}`
    );
  }

  /**
   * Convenience completion function (uses current provider)
   */
  async completion(options) {
    return this.createCompletion(options);
  }

  /**
   * Estimate context size in tokens
   */
  estimateContextSize(messages) {
    if (!messages || messages.length === 0) {
      return 0;
    }
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

    for (const provider of this.providers) {
      if (provider.fitsInContext(messages)) {
        logger.debug('Selected provider for context', {
          provider: provider.name,
          messageCount: messages.length
        });
        return provider;
      }
    }

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
      models: Object.keys(p.models || p.modelMap || {}),
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
      models: provider.models || provider.modelMap || {},
      defaultModel: provider.defaultModel
    };
  }

  /**
   * Get a list of all model options for UI/API
   */
  getModelOptions() {
    return getModelOptions();
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
 * Set provider by name or model ID
 */
export function setProvider(providerName) {
  adapter.setProvider(providerName);
}

/**
 * Set explicit model name
 */
export function setModel(model) {
  adapter.setModel(model);
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

/**
 * Get model options
 */
export function getModelOptionsForAdapter() {
  return adapter.getModelOptions();
}

export default adapter;
export { adapter };
