/**
 * Model Registry - Centralized model configuration and selection
 * Provides all available LLM models with their capabilities and routing info.
 *
 * Each model carries a `contextWindow` (in tokens) and a `maxOutputTokens`
 * reservation so the ContextManager can truncate prompts to fit and so the
 * adapter can pass correct `max_tokens` / `num_ctx` values to providers.
 */

import logger from '../utils/logger.js';

/**
 * Default context window used when nothing is configured for a model.
 * 128k is a safe ceiling for most modern coding models (GPT-4o, Llama 3.x,
 * Qwen 2.5, etc.) and is also the default `num_ctx` we will send to Ollama.
 */
const DEFAULT_CONTEXT_WINDOW = parseInt(process.env.DEFAULT_CONTEXT_WINDOW || '128000', 10);
const DEFAULT_MAX_OUTPUT_TOKENS = parseInt(process.env.DEFAULT_MAX_OUTPUT_TOKENS || '4096', 10);

/**
 * Base model options. `contextWindow` is the total input+output budget the
 * provider advertises for the model. `maxOutputTokens` is the per-request
 * output reservation we will use unless the caller overrides it.
 */
const BASE_MODEL_OPTIONS = [
  {
    id: 'groq-llama-70b',
    name: 'Llama 3.3 70B',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    speed: 'fast',
    speedLabel: '⚡',
    bestFor: ['code', 'planning', 'general'],
    description: 'Best all-around model for code and general tasks',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    default: true
  },
  {
    id: 'groq-llama-8b',
    name: 'Llama 3.1 8B',
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    speed: 'fastest',
    speedLabel: '⚡⚡',
    bestFor: ['simple', 'quick'],
    description: 'Fastest model for simple tasks',
    contextWindow: 128000,
    maxOutputTokens: 8192
  },
  {
    id: 'anthropic-sonnet',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    speed: 'medium',
    speedLabel: '🧠',
    bestFor: ['complex', 'analysis', 'quality'],
    description: 'Highest quality for complex reasoning',
    contextWindow: 200000,
    maxOutputTokens: 8192
  },
  {
    id: 'gemini-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    speed: 'medium',
    speedLabel: '🧠',
    bestFor: ['complex', 'analysis', 'long-context'],
    description: 'Large context window for architecture and documentation',
    contextWindow: 2000000, // 2M tokens
    maxOutputTokens: 8192
  },
  {
    id: 'gemini-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    speed: 'fast',
    speedLabel: '⚡',
    bestFor: ['simple', 'quick', 'long-context'],
    description: 'Fast model with long context',
    contextWindow: 1000000, // 1M tokens
    maxOutputTokens: 8192
  },
  {
    id: 'openai-gpt4o',
    name: 'OpenAI GPT-4o',
    provider: 'openai',
    model: 'gpt-4o',
    speed: 'medium',
    speedLabel: '🧠',
    bestFor: ['code', 'analysis', 'general'],
    description: 'OpenAI GPT-4o via OpenAI-compatible API',
    contextWindow: 128000,
    maxOutputTokens: 16384
  },
  {
    id: 'openai-gpt4o-mini',
    name: 'OpenAI GPT-4o Mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    speed: 'fast',
    speedLabel: '⚡',
    bestFor: ['simple', 'quick', 'code'],
    description: 'Fast, low-cost OpenAI model',
    contextWindow: 128000,
    maxOutputTokens: 16384
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    provider: 'ollama',
    model: process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b',
    speed: 'slow',
    speedLabel: '🖥️',
    bestFor: ['offline', 'private', 'local'],
    description: 'Local Ollama model for offline/private use',
    contextWindow: parseInt(process.env.OLLAMA_CONTEXT_WINDOW || String(DEFAULT_CONTEXT_WINDOW), 10),
    maxOutputTokens: parseInt(process.env.OLLAMA_MAX_OUTPUT_TOKENS || '4096', 10)
  },
  {
    id: 'openai-compatible',
    name: 'OpenRouter / Custom',
    provider: 'openai-compatible',
    model: process.env.OPENAI_COMPATIBLE_MODEL || 'default',
    speed: 'medium',
    speedLabel: '🔌',
    bestFor: ['custom', 'local', 'self-hosted'],
    description: 'OpenRouter or any OpenAI-compatible endpoint (LM Studio, vLLM, etc.)',
    contextWindow: parseInt(process.env.OPENAI_COMPATIBLE_CONTEXT_WINDOW || '8192', 10),
    maxOutputTokens: parseInt(process.env.OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS || '4096', 10)
  },
  {
    id: 'openrouter-kimi',
    name: 'Kimi K2 (OpenRouter)',
    provider: 'openai-compatible',
    model: 'moonshotai/kimi-k2:free',
    speed: 'medium',
    speedLabel: '🧠',
    bestFor: ['code', 'analysis', 'long-context'],
    description: 'Kimi K2 via OpenRouter — 256k context, strong reasoning',
    contextWindow: 256000,
    maxOutputTokens: 8192
  },
  {
    id: 'openrouter-glm',
    name: 'GLM-4.5 (OpenRouter)',
    provider: 'openai-compatible',
    model: 'zhipuai/glm-4.5:free',
    speed: 'fast',
    speedLabel: '⚡',
    bestFor: ['code', 'chat', 'general'],
    description: 'GLM-4.5 via OpenRouter — fast, strong coding model',
    contextWindow: 128000,
    maxOutputTokens: 8192
  },
  {
    id: 'openrouter-llama',
    name: 'Llama 3.3 70B (OpenRouter)',
    provider: 'openai-compatible',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    speed: 'medium',
    speedLabel: '⚡',
    bestFor: ['code', 'general', 'chat'],
    description: 'Llama 3.3 70B via OpenRouter — free, no rate limits',
    contextWindow: 128000,
    maxOutputTokens: 8192
  },
  {
    id: 'local',
    name: 'Local OpenAI-compatible',
    provider: 'local',
    model: process.env.LOCAL_MODEL || 'default',
    speed: 'slow',
    speedLabel: '🖥️',
    bestFor: ['offline', 'private', 'local'],
    description: 'Local inference server without API key',
    contextWindow: parseInt(process.env.LOCAL_CONTEXT_WINDOW || '8192', 10),
    maxOutputTokens: parseInt(process.env.LOCAL_MAX_OUTPUT_TOKENS || '4096', 10)
  },
  {
    id: 'phone',
    name: 'Phone (Termux/Ollama)',
    provider: 'phone',
    model: process.env.PHONE_MODEL || 'phi3:mini',
    speed: 'slow',
    speedLabel: '📱',
    bestFor: ['mobile', 'offline', 'private'],
    description: 'Phone-powered Ollama via WebSocket bridge',
    // Phone capabilities are reported by the device itself at REGISTER time;
    // this is just a fallback before the device connects.
    contextWindow: parseInt(process.env.PHONE_CONTEXT_WINDOW || '4096', 10),
    maxOutputTokens: parseInt(process.env.PHONE_MAX_OUTPUT_TOKENS || '2048', 10)
  },
  {
    id: 'echo',
    name: 'Echo (offline fallback)',
    provider: 'echo',
    model: 'echo-local',
    speed: 'instant',
    speedLabel: '🪢',
    bestFor: ['offline', 'demo', 'testing'],
    description: 'Deterministic offline fallback — no API key needed. Generates plausible files for demo purposes.',
    contextWindow: 32000,
    maxOutputTokens: 4096
  }
];

/**
 * Build a complete model list from static config and environment variables.
 * Environment-driven overrides win over the static BASE_MODEL_OPTIONS.
 */
export function getModelOptions() {
  const options = BASE_MODEL_OPTIONS.map(m => ({ ...m }));

  // Add custom OpenAI-compatible endpoint if configured
  if (process.env.OPENAI_COMPATIBLE_BASE_URL) {
    const custom = options.find(m => m.id === 'openai-compatible');
    if (custom) {
      custom.model = process.env.OPENAI_COMPATIBLE_MODEL || custom.model;
    }
  }

  // Update Ollama model from environment
  if (process.env.OLLAMA_MODEL || process.env.OLLAMA_HOST) {
    const ollama = options.find(m => m.id === 'ollama');
    if (ollama) {
      ollama.model = process.env.OLLAMA_MODEL || ollama.model;
    }
  }

  // Update local model from environment
  if (process.env.LOCAL_MODEL || process.env.LOCAL_API_BASE_URL) {
    const local = options.find(m => m.id === 'local');
    if (local) {
      local.model = process.env.LOCAL_MODEL || local.model;
    }
  }

  // Update phone model from environment
  if (process.env.PHONE_MODEL) {
    const phone = options.find(m => m.id === 'phone');
    if (phone) {
      phone.model = process.env.PHONE_MODEL;
    }
  }

  // Update OpenAI default model from environment
  if (process.env.OPENAI_MODEL) {
    const openaiDefault = options.find(m => m.provider === 'openai' && m.model.startsWith('gpt-4o'));
    if (openaiDefault) {
      openaiDefault.model = process.env.OPENAI_MODEL;
    }
  }

  return options;
}

/**
 * Get model configuration by ID
 */
export function getModelById(modelId) {
  return getModelOptions().find(m => m.id === modelId) || null;
}

/**
 * Get model configuration by name (fallback for older frontends)
 */
export function getModelByName(name) {
  return getModelOptions().find(m => m.name === name || m.id === name) || null;
}

/**
 * Resolve a model identifier or display name to a provider/model pair.
 * Always returns `contextWindow` and `maxOutputTokens` so callers can size
 * prompts and `max_tokens` correctly.
 */
export function resolveModel(modelIdOrName) {
  const model = getModelById(modelIdOrName) || getModelByName(modelIdOrName);
  if (!model) return null;

  return {
    provider: model.provider,
    model: model.model,
    id: model.id,
    contextWindow: model.contextWindow || DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: model.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS
  };
}

/**
 * Get default model configuration
 */
export function getDefaultModel() {
  return getModelOptions().find(m => m.default) || getModelOptions()[0];
}

/**
 * Get all models for a specific provider
 */
export function getModelsByProvider(provider) {
  return getModelOptions().filter(m => m.provider === provider);
}

/**
 * Get the context window for a model id, with a safe fallback.
 * @param {string} modelIdOrName
 * @returns {number}
 */
export function getContextWindowForModel(modelIdOrName) {
  const resolved = resolveModel(modelIdOrName);
  if (resolved?.contextWindow) return resolved.contextWindow;
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Get the max output tokens for a model id, with a safe fallback.
 * @param {string} modelIdOrName
 * @returns {number}
 */
export function getMaxOutputTokensForModel(modelIdOrName) {
  const resolved = resolveModel(modelIdOrName);
  if (resolved?.maxOutputTokens) return resolved.maxOutputTokens;
  return DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Validate if a model ID exists
 */
export function isValidModelId(modelId) {
  return getModelOptions().some(m => m.id === modelId);
}

/**
 * Validate if a model name or ID exists
 */
export function isValidModel(modelIdOrName) {
  return getModelOptions().some(m => m.id === modelIdOrName || m.name === modelIdOrName);
}

/**
 * Get model display info for UI
 */
export function getModelDisplayInfo(modelId) {
  const model = getModelById(modelId);
  if (!model) return null;

  return {
    name: model.name,
    provider: model.provider,
    speedLabel: model.speedLabel,
    description: model.description,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens
  };
}

export { DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_OUTPUT_TOKENS };

// Re-export the logger binding for parity with the rest of the codebase.
export { logger };
