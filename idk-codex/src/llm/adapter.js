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

    // ===== LOCAL MODE (Phase 5.4) =====
    // If no providers are configured at all, default to Ollama on localhost
    // with llama3.2 so the agent can run with zero configuration.
    const hasAnyConfig = !!(
      process.env.OPENAI_COMPATIBLE_API_KEY ||
      process.env.OPENAI_COMPATIBLE_BASE_URL ||
      process.env.OPENAI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.OLLAMA_HOST ||
      process.env.LOCAL_API_BASE_URL ||
      process.env.PHONE_SECRET
    );

    if (!hasAnyConfig) {
      logger.info('No LLM provider configured — defaulting to local Ollama (llama3.2). ' +
        'Install Ollama from https://ollama.com and run `ollama pull llama3.2`.');
      if (!process.env.OLLAMA_HOST) process.env.OLLAMA_HOST = 'http://localhost:11434';
      if (!process.env.OLLAMA_MODEL) process.env.OLLAMA_MODEL = 'llama3.2';
      if (!process.env.LLM_PROVIDER_PRIORITY) {
        process.env.LLM_PROVIDER_PRIORITY = 'ollama,echo';
      }
    }

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
    const echoEnabled = optionsCopy.echoEnabled !== false; // default: true unless explicitly false

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
    const autoFallback = process.env.LLM_AUTO_FALLBACK === 'true';

    // Filter out Echo provider unless echoEnabled is true
    const availableProviders = this.providers.filter(p => {
      if (p.name === 'echo') return echoEnabled;
      return true;
    });

    const userSelectedProviderName = this.currentProvider?.name;
    const errors = [];

    // Only try the user's selected provider (+ echo as last resort if enabled)
    const providersToTry = autoFallback
      ? availableProviders
      : availableProviders.filter(p => p.name === userSelectedProviderName || (echoEnabled && p.name === 'echo'));

    const maxAttempts = providersToTry.length;
    const currentProviderIndex = providersToTry.findIndex(p => p.name === userSelectedProviderName);
    const startIndex = currentProviderIndex >= 0 ? currentProviderIndex : 0;

    let lastError = null;
    const attemptedProviders = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const providerIndex = (startIndex + attempt) % providersToTry.length;
      const provider = providersToTry[providerIndex] || this.currentProvider;
      attemptedProviders.push(provider.name);

      const providerModel = provider === this.currentProvider ? optionsCopy.model : provider.defaultModel;
      const attemptOptions = this.applyContextBudget(optionsCopy, provider, providerModel);

      try {
        logger.debug('Attempting completion', {
          provider: provider.name,
          model: providerModel,
          attempt: attempt + 1,
          maxAttempts,
        });

        const result = await provider.createCompletion(attemptOptions);
        this.currentProvider = provider;
        this.currentModel = result.model || providerModel;

        // Tag the result with which model actually responded
        result._meta = {
          provider: provider.name,
          model: providerModel || 'unknown',
          requestedModel: userSelectedProviderName
        };

        return result;
      } catch (error) {
        lastError = error;
        errors.push({ provider: provider.name, error: error.message });
        logger.warn('Provider completion failed', {
          provider: provider.name,
          error: error.message,
          attempt: attempt + 1
        });

        // If this was the user's selected provider, STOP and tell them
        if (provider.name === userSelectedProviderName && !autoFallback) {
          throw new Error(
            `Your selected model (${provider.name}) failed: ${error.message}. ` +
            `Please switch to a different model in the dropdown above.`
          );
        }
      }
    }

    logger.error('All LLM providers failed', {
      attemptedProviders,
      lastError: lastError?.message
    });

    throw new Error(
      `All providers failed. Errors:\n${errors.map(e => `- ${e.provider}: ${e.error}`).join('\n')}\n\n` +
      `Please check your API keys or select a different model.`
    );
  }

  /**
   * Convenience completion function (uses current provider)
   */
  async completion(options) {
    // ===== LOCAL MODE (Phase 5.4) =====
    // If the active provider is Ollama and it's not reachable, return a
    // helpful error so the user knows to install/start Ollama.
    if (this.currentProvider?.name === 'ollama' && !this._ollamaChecked) {
      this._ollamaChecked = true; // only check once per process
      const isReachable = await this._checkOllamaReachable();
      if (!isReachable) {
        throw new Error(
          'Ollama is not running. To use local mode:\n' +
          '  1. Install Ollama:  https://ollama.com/download\n' +
          '  2. Pull a model:    `ollama pull llama3.2`\n' +
          '  3. Start Ollama:    `ollama serve` (or launch the app)\n\n' +
          `Configured host: ${process.env.OLLAMA_HOST || 'http://localhost:11434'}\n` +
          `Configured model: ${process.env.OLLAMA_MODEL || 'llama3.2'}\n\n` +
          'Alternatively, set OPENAI_COMPATIBLE_API_KEY (OpenRouter) for cloud mode.'
        );
      }
    }
    return this.createCompletion(options);
  }

  /**
   * Check if the configured Ollama host is reachable.
   * Returns true on success, false on any failure.
   */
  async _checkOllamaReachable() {
    try {
      const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${host}/api/tags`, { signal: ctrl.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
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

// ============================================================================
// STREAMING — async generator that yields chunks in real-time
// ============================================================================

/**
 * Resolve a list of providers to try for streaming, in priority order.
 * Tries: OpenRouter (openai-compatible), Groq, Anthropic, OpenAI, Ollama.
 * Falls back to whatever providers are configured.
 */
function getStreamingProviderOrder() {
  if (!adapter.initialized) {
    try { adapter.initialize(); } catch { /* no providers */ }
  }

  const preference = ['openai-compatible', 'groq', 'anthropic', 'openai', 'ollama'];
  const sorted = [...adapter.providers].sort((a, b) => {
    const ai = preference.indexOf(a.name);
    const bi = preference.indexOf(b.name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return sorted;
}

/**
 * Parse a single Server-Sent Events (SSE) chunk from a stream reader.
 * Returns an array of { data, event? } objects (one per `data:` line block).
 */
async function* parseSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const lines = rawEvent.split('\n');
        let data = '';
        let event = null;
        for (const line of lines) {
          if (line.startsWith('data:')) {
            data += line.slice(5).trim();
          } else if (line.startsWith('event:')) {
            event = line.slice(6).trim();
          }
        }
        if (data) {
          yield { data, event };
        }
      }
    }

    // Flush any remaining buffered data
    if (buffer.trim()) {
      const lines = buffer.split('\n');
      let data = '';
      for (const line of lines) {
        if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) yield { data, event: null };
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

/**
 * Stream a completion from an OpenAI-compatible endpoint (OpenRouter, OpenAI, Groq, etc.)
 * Yields { type, content, toolCalls } chunks.
 */
async function* streamOpenAICompatible(provider, options) {
  const {
    messages,
    temperature = 0.3,
    max_tokens,
    tools,
    tool_choice
  } = options;

  const model = options.model || provider.defaultModel;
  if (!model) {
    throw new Error('No model configured for streaming');
  }

  const body = {
    model,
    messages,
    temperature,
    max_tokens: max_tokens || 4096,
    stream: true
  };
  if (tools && Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = tool_choice || 'auto';
  }

  const headers = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  if (provider.baseURL && provider.baseURL.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = process.env.FRONTEND_URL || 'https://maxxxxx-production.up.railway.app';
    headers['X-Title'] = 'MAX Agent';
  }

  const response = await fetch(`${provider.baseURL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stream failed (${response.status}): ${text}`);
  }

  // Accumulate tool-call fragments across chunks (OpenAI streams them in pieces)
  const toolCallAccumulator = [];

  for await (const { data } of parseSSEStream(response)) {
    if (data === '[DONE]') break;
    let json;
    try { json = JSON.parse(data); } catch { continue; }

    const choice = json.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta || {};

    // Reasoning content (OpenRouter/o1 style)
    if (delta.reasoning || delta.reasoning_content) {
      yield { type: 'reasoning', content: delta.reasoning || delta.reasoning_content, toolCalls: null };
    }

    // Text content
    if (delta.content) {
      yield { type: 'token', content: delta.content, toolCalls: null };
    }

    // Tool call fragments
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallAccumulator[idx]) {
          toolCallAccumulator[idx] = { id: tc.id || '', function: { name: '', arguments: '' } };
        }
        if (tc.id) toolCallAccumulator[idx].id = tc.id;
        if (tc.function?.name) toolCallAccumulator[idx].function.name += tc.function.name;
        if (tc.function?.arguments) toolCallAccumulator[idx].function.arguments += tc.function.arguments;
      }
    }

    if (choice.finish_reason) {
      // Final chunk — emit accumulated tool calls
      if (toolCallAccumulator.length > 0) {
        const toolCalls = toolCallAccumulator
          .filter(Boolean)
          .map(tc => ({
            id: tc.id || `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments }
          }));
        yield { type: 'token', content: '', toolCalls };
      }
    }
  }
}

/**
 * Stream a completion from Anthropic via the messages API.
 */
async function* streamAnthropic(provider, options) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const {
    messages,
    temperature = 0.3,
    max_tokens = 4096
  } = options;

  const model = options.model || provider.defaultModel;
  const systemMessage = messages.find(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  const body = {
    model,
    messages: conversationMessages,
    temperature,
    max_tokens,
    stream: true
  };
  if (systemMessage) body.system = systemMessage.content;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    signal: options.signal
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic stream failed (${response.status}): ${text}`);
  }

  for await (const { data, event } of parseSSEStream(response)) {
    if (!data) continue;
    let json;
    try { json = JSON.parse(data); } catch { continue; }

    if (json.type === 'content_block_delta' && json.delta?.text) {
      yield { type: 'token', content: json.delta.text, toolCalls: null };
    } else if (json.type === 'content_block_delta' && json.delta?.thinking) {
      yield { type: 'reasoning', content: json.delta.thinking, toolCalls: null };
    }
  }
}

/**
 * Stream a completion from an Ollama server.
 */
async function* streamOllama(provider, options) {
  const {
    messages,
    temperature = 0.3,
    max_tokens
  } = options;

  const model = options.model || provider.defaultModel;
  const contextWindow = provider.getModelInfo?.(model)?.contextWindow || 8192;

  const body = {
    model,
    messages,
    stream: true,
    options: {
      temperature,
      num_predict: max_tokens || 4096,
      num_ctx: contextWindow
    }
  };

  const response = await fetch(`${provider.host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama stream failed (${response.status}): ${text}`);
  }

  // Ollama streams newline-delimited JSON objects (not SSE)
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            yield { type: 'token', content: json.message.content, toolCalls: null };
          }
          if (json.done) return;
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

/**
 * Streaming completion — async generator yielding chunks in real-time.
 * Tries providers in priority order: OpenRouter (openai-compatible), Groq, Anthropic, OpenAI, Ollama.
 * Falls back to the next provider on failure.
 *
 * @param {Object} options - same as completion(), plus optional `signal` for AbortSignal
 * @yields {{ type: 'token'|'reasoning', content: string, toolCalls: Array|null }}
 */
export async function* streamCompletion(options) {
  if (!adapter.initialized) {
    adapter.initialize();
  }

  const opts = { ...options };
  const echoEnabled = opts.echoEnabled !== false;

  // Resolve model if provided
  if (opts.model) {
    const resolved = adapter.resolveModelAndProvider(opts.model);
    adapter.currentProvider = resolved.provider;
    adapter.currentModel = resolved.model;
    opts.model = resolved.model;
  } else {
    opts.model = adapter.currentModel || adapter.currentProvider?.defaultModel;
  }

  const providers = getStreamingProviderOrder().filter(p => {
    if (p.name === 'echo') return echoEnabled;
    return true;
  });

  if (providers.length === 0) {
    yield { type: 'token', content: '[No LLM providers available for streaming]', toolCalls: null };
    return;
  }

  let lastError = null;
  for (const provider of providers) {
    // Skip providers we can't stream from (echo, phone, gemini without streaming support)
    if (provider.name === 'echo' || provider.name === 'phone' || provider.name === 'gemini') {
      continue;
    }

    try {
      const providerModel = provider === adapter.currentProvider
        ? opts.model
        : provider.defaultModel;
      const attemptOpts = { ...opts, model: providerModel };

      if (provider.name === 'ollama') {
        yield* streamOllama(provider, attemptOpts);
      } else if (provider.name === 'anthropic') {
        yield* streamAnthropic(provider, attemptOpts);
      } else if (provider.name === 'openai-compatible' || provider.name === 'openai' || provider.name === 'groq') {
        yield* streamOpenAICompatible(provider, attemptOpts);
      } else {
        // Unknown provider — skip
        continue;
      }

      // If we got here, streaming succeeded — return (the generator above completes when done)
      return;
    } catch (err) {
      lastError = err;
      logger.warn('Streaming provider failed, trying next', {
        provider: provider.name,
        error: err.message
      });
      // Continue to next provider
    }
  }

  // All providers failed — yield an error token so the client sees something
  yield {
    type: 'token',
    content: `[Streaming failed: ${lastError?.message || 'unknown error'}]`,
    toolCalls: null
  };
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
 * Save user's model preference to SQLite (persists across restarts)
 */
export function setUserModelPreference(userId, provider, model) {
  try {
    import('../database/db.js').then(({ getDatabase }) => {
      const db = getDatabase();
      db.prepare(`CREATE TABLE IF NOT EXISTS user_model_preferences (
        user_id TEXT PRIMARY KEY,
        provider TEXT,
        model TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )`).run();

      db.prepare(`INSERT INTO user_model_preferences (user_id, provider, model, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
        provider = excluded.provider,
        model = excluded.model,
        updated_at = datetime('now')
      `).run(userId, provider, model);
    });
  } catch (e) {
    logger.error('Failed to save model preference', { error: e.message });
  }
}

/**
 * Get user's model preference from SQLite (sync — must be called after db is loaded)
 */
export function getUserModelPreference(userId) {
  try {
    // Use sync require-style — this is a sync function
    // In ESM, we can't use require, so we use a cached import
    if (global._maxDb) {
      const db = global._maxDb;
      const row = db.prepare('SELECT model, provider FROM user_model_preferences WHERE user_id = ?').get(userId);
      return row || null;
    }
    return null;
  } catch (e) {
    return null;
  }
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
