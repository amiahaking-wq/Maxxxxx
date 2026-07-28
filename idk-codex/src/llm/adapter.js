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
import { EchoProvider } from './providers/echo.js';
import phoneBridge from '../interfaces/phone-bridge.js';
import { resolveModel, getModelOptions } from './model-registry.js';
import { IntelligentProviderRouter } from './routing-engine.js';
import { ContextManager, truncateMessages, getInputBudget, estimateTokens, getContextWindow } from '../context/context-manager.js';
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

    // Get priority list, but ALWAYS include openai-compatible if configured
    // Priority list — openrouter/auto first, then phone (termux), then echo
    // Groq removed — rate limits too low (12k TPM). Use OpenRouter instead.
    let rawPriority = process.env.LLM_PROVIDER_PRIORITY || 'openai-compatible,phone,echo';
    // If openai-compatible is not in the priority list but is configured, add it at the front
    if (!rawPriority.includes('openai-compatible') &&
        (process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_COMPATIBLE_API_KEY)) {
      rawPriority = 'openai-compatible,' + rawPriority;
    }
    const priorityList = rawPriority
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
              logger.info('✓ OpenAI provider initialized', {
                baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
              });
            }
            break;

          case 'openai-compatible':
            if (process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_COMPATIBLE_API_KEY) {
              const compatCtx = parseInt(process.env.OPENAI_COMPATIBLE_CONTEXT_WINDOW || '128000', 10);
              const compatMaxOut = parseInt(process.env.OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS || '8192', 10);

              // CRITICAL: Check if the configured model is a known-dead free model.
              // If so, replace with openrouter/auto which automatically picks
              // the best available free model for the task.
              const DEAD_MODELS = [
                'deepseek/deepseek-r1:free',
                'moonshotai/kimi-k2:free',
                'qwen/qwen-2.5-coder-32b-instruct:free',
                'qwen/qwen-2.5-72b-instruct:free',
                'mistralai/mistral-small-3.1-24b-instruct:free',
                'zhipuai/glm-4.5:free',
                'meta-llama/llama-3.3-70b-instruct:free',
                'openai/gpt-oss-20b:free',
                'openai/gpt-oss-120b:free'
              ];
              // Use openrouter/auto — OpenRouter automatically picks the best
              // free model based on the task. No need to list specific models.
              // One API key, automatic model selection.
              let compatModel = process.env.OPENAI_COMPATIBLE_MODEL || 'openrouter/auto';
              if (DEAD_MODELS.includes(compatModel)) {
                logger.warn(`⚠️ Configured model "${compatModel}" may be dead. Switching to openrouter/auto for automatic free model selection.`);
                compatModel = 'openrouter/auto';
                process.env.OPENAI_COMPATIBLE_MODEL = compatModel;
              }

              this.providers.push(new OpenAICompatibleProvider({
                name: 'openai-compatible',
                baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL || 'http://localhost:8000/v1',
                apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
                defaultModel: compatModel,
                models: [
                  { id: compatModel, maxTokens: compatMaxOut, contextWindow: compatCtx }
                ]
              }));
              logger.info('✓ OpenAI-compatible provider initialized', {
                baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL || 'http://localhost:8000/v1',
                model: compatModel,
                contextWindow: compatCtx,
                maxOutputTokens: compatMaxOut
              });
            }
            break;

          case 'local':
            if (process.env.LOCAL_API_BASE_URL) {
              const localCtx = parseInt(process.env.LOCAL_CONTEXT_WINDOW || '8192', 10);
              const localMaxOut = parseInt(process.env.LOCAL_MAX_OUTPUT_TOKENS || '4096', 10);
              this.providers.push(new OpenAICompatibleProvider({
                name: 'local',
                baseURL: process.env.LOCAL_API_BASE_URL,
                apiKey: process.env.LOCAL_API_KEY || '',
                defaultModel: process.env.LOCAL_MODEL || 'default',
                models: [
                  { id: process.env.LOCAL_MODEL || 'default', maxTokens: localMaxOut, contextWindow: localCtx }
                ]
              }));
              logger.info('✓ Local provider initialized', {
                baseURL: process.env.LOCAL_API_BASE_URL,
                contextWindow: localCtx,
                maxOutputTokens: localMaxOut
              });
            }
            break;

          case 'ollama':
            if (process.env.OLLAMA_HOST) {
              const ollamaCtx = parseInt(process.env.OLLAMA_CONTEXT_WINDOW || '128000', 10);
              const ollamaMaxOut = parseInt(process.env.OLLAMA_MAX_OUTPUT_TOKENS || '4096', 10);
              this.providers.push(new OllamaProvider({
                host: process.env.OLLAMA_HOST,
                model: process.env.OLLAMA_MODEL,
                models: [
                  { id: process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b', maxTokens: ollamaMaxOut, contextWindow: ollamaCtx }
                ]
              }));
              logger.info('✓ Ollama provider initialized', {
                host: process.env.OLLAMA_HOST,
                model: process.env.OLLAMA_MODEL,
                contextWindow: ollamaCtx,
                maxOutputTokens: ollamaMaxOut
              });
            }
            break;

          case 'phone':
            this.providers.push(new PhoneProvider(phoneBridge));
            logger.info('✓ Phone provider initialized (waiting for device connection)');
            break;

          case 'echo':
            // Always available when ECHO_PROVIDER_ENABLED=true. Use as a last-resort
            // fallback so the agent loop can complete end-to-end without any external
            // API key. Returns deterministic, task-aware responses.
            if (process.env.ECHO_PROVIDER_ENABLED === 'true') {
              this.providers.push(new EchoProvider());
              logger.info('✓ Echo provider initialized (deterministic fallback)');
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
   * Apply context-window-aware truncation to a request before sending it to a provider.
   *
   * - Resolves the context window for the model being used (registry first, then
   *   provider, then default).
   * - Reserves `maxOutputTokens` for the response.
   * - Truncates `messages` via `truncateMessages` so we never exceed the input budget.
   * - Caps `max_tokens` to the model's output reservation.
   * - Returns a *new* options object; the caller's original is not mutated.
   *
   * @param {Object} options - request options (will be shallow-copied)
   * @param {Object} provider - provider instance about to handle the request
   * @param {string} model - resolved model id (actual model name)
   * @returns {Object} updated options with messages truncated and max_tokens capped
   */
  applyContextBudget(options, provider, model) {
    const opts = { ...options };

    // 1. Resolve the context window for this model
    // Priority: registry (which knows the model id) -> provider.getModelInfo -> default
    let contextWindow = null;
    let maxOutputTokens = null;

    // Try to find the registry entry by matching provider+model
    const allModels = getModelOptions();
    const registryMatch = allModels.find(
      m => m.provider === provider?.name && m.model === model
    );
    if (registryMatch) {
      contextWindow = registryMatch.contextWindow;
      maxOutputTokens = registryMatch.maxOutputTokens;
    }

    if (!contextWindow && provider?.getModelInfo) {
      const info = provider.getModelInfo(model);
      if (info?.contextWindow) contextWindow = info.contextWindow;
      if (info?.maxTokens && !maxOutputTokens) maxOutputTokens = info.maxTokens;
    }

    if (!contextWindow) {
      contextWindow = getContextWindow(model, provider);
    }
    if (!maxOutputTokens) {
      maxOutputTokens = parseInt(process.env.DEFAULT_MAX_OUTPUT_TOKENS || '4096', 10);
    }

    // 2. Set the model to the provider's model (not the original request's model)
    //    This fixes the bug where falling back to Gemini sends Groq's model name
    opts.model = model;

    // 3. Honor caller-specified max_tokens but cap to the model's output reservation
    const requestedOutput = opts.max_tokens || opts.maxTokens || maxOutputTokens;
    const effectiveOutput = Math.min(requestedOutput, maxOutputTokens);
    opts.max_tokens = effectiveOutput;
    if (opts.maxTokens) opts.maxTokens = effectiveOutput;

    // 3. Compute input budget and truncate messages
    const inputBudget = getInputBudget(contextWindow, effectiveOutput);
    const originalMessages = Array.isArray(opts.messages) ? opts.messages : [];
    const originalTokens = originalMessages.reduce(
      (sum, m) => sum + estimateTokens(m?.content),
      0
    );

    if (originalTokens > inputBudget) {
      const truncated = truncateMessages(originalMessages, inputBudget);
      const droppedCount = originalMessages.length - truncated.length;
      logger.info('ContextManager: truncated messages to fit model context window', {
        provider: provider?.name,
        model,
        contextWindow,
        effectiveOutput,
        inputBudget,
        originalTokens,
        originalCount: originalMessages.length,
        truncatedCount: truncated.length,
        droppedCount
      });
      opts.messages = truncated;
    }

    // 4. Stash budget metadata so providers (e.g. Ollama) can read contextWindow
    //    and pass it as num_ctx if they want to.
    opts._contextWindow = contextWindow;
    opts._maxOutputTokens = effectiveOutput;

    // Ensure tools and tool_choice pass through to the provider
    if (options.tools) opts.tools = options.tools;
    if (options.tool_choice) opts.tool_choice = options.tool_choice;

    return opts;
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
        const routedModel = this.currentProvider.defaultModel;
        optionsCopy.model = routedModel;

        // Apply context budget for the routed provider/model BEFORE sending
        const budgetedOptions = this.applyContextBudget(optionsCopy, selectedProvider, routedModel);

        logger.debug('Using intelligent routing', {
          taskType,
          contextSize,
          selectedProvider: selectedProviderName,
          contextWindow: budgetedOptions._contextWindow,
          maxOutputTokens: budgetedOptions._maxOutputTokens
        });

        const fallbackProviders = this.providers
          .filter(p => p.name !== selectedProviderName)
          .map(p => p.name);

        try {
          return await this.router.executeWithBackoff(
            () => selectedProvider.createCompletion(budgetedOptions),
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
    // DISABLED auto-fallback by default — if the user selected a specific model,
    // respect that choice. If it fails, return the error instead of silently
    // switching to a different provider. The user gets told what happened.
    const autoFallback = process.env.LLM_AUTO_FALLBACK === 'true'; // Must be explicitly enabled

    // Filter out Echo provider unless explicitly enabled at call time
    // This prevents Echo from being used as a fallback for real tasks/chat
    const availableProviders = this.providers.filter(p => {
      if (p.name === 'echo') {
        return process.env.ECHO_PROVIDER_ENABLED === 'true';
      }
      return true;
    });

    const maxAttempts = autoFallback ? availableProviders.length : 1;

    // Start fallback from the currently selected provider
    const currentProviderIndex = availableProviders.findIndex(p => p.name === this.currentProvider?.name);
    const startIndex = currentProviderIndex >= 0 ? currentProviderIndex : 0;

    let lastError = null;
    const attemptedProviders = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const providerIndex = (startIndex + attempt) % availableProviders.length;
      const provider = availableProviders[providerIndex] || this.currentProvider;
      attemptedProviders.push(provider.name);

      // The model we'll actually send to this provider:
      // - If this is the user-selected provider, use the resolved model name.
      // - If we've fallen back to a different provider, use its default model.
      const providerModel = provider === this.currentProvider ? optionsCopy.model : provider.defaultModel;

      // Apply context budget per-provider so each fallback attempt is sized correctly
      const attemptOptions = this.applyContextBudget(optionsCopy, provider, providerModel);

      try {
        logger.debug('Attempting completion', {
          provider: provider.name,
          model: providerModel,
          attempt: attempt + 1,
          maxAttempts,
          contextWindow: attemptOptions._contextWindow,
          maxOutputTokens: attemptOptions._maxOutputTokens,
          messageCount: attemptOptions.messages?.length || 0
        });

        const result = await provider.createCompletion(attemptOptions);
        this.currentProvider = provider;
        this.currentModel = result.model || providerModel;

        return result;
      } catch (error) {
        lastError = error;
        logger.warn('Provider completion failed', {
          provider: provider.name,
          error: error.message,
          attempt: attempt + 1
        });

        if (attempt < maxAttempts - 1) {
          const nextIndex = (startIndex + attempt + 1) % availableProviders.length;
          logger.info('Falling back to next provider', {
            from: provider.name,
            to: availableProviders[nextIndex]?.name
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
