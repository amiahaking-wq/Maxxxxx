/**
 * Model Registry - Centralized model configuration and selection
 * Provides all available LLM models with their capabilities and routing info
 */

export const MODEL_OPTIONS = [
  {
    id: 'groq-llama-70b',
    name: 'Llama 3.3 70B',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    speed: 'fast',
    speedLabel: '⚡',
    bestFor: ['code', 'planning', 'general'],
    description: 'Best all-around model for code and general tasks',
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
    description: 'Fastest model for simple tasks'
  },
  {
    id: 'anthropic-sonnet',
    name: 'Claude Sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    speed: 'medium',
    speedLabel: '🧠',
    bestFor: ['complex', 'analysis', 'quality'],
    description: 'Highest quality for complex reasoning'
  },
  {
    id: 'phone-qwen',
    name: 'Qwen 2.5 Coder 3B',
    provider: 'phone',
    model: 'qwen2.5-coder:3b',
    speed: 'slow',
    speedLabel: '📱',
    bestFor: ['offline', 'private'],
    description: 'Local model for offline/private use'
  }
];

/**
 * Get model configuration by ID
 * @param {string} modelId - Model identifier
 * @returns {object|null} Model configuration or null if not found
 */
export function getModelById(modelId) {
  return MODEL_OPTIONS.find(m => m.id === modelId) || null;
}

/**
 * Get default model configuration
 * @returns {object} Default model configuration
 */
export function getDefaultModel() {
  return MODEL_OPTIONS.find(m => m.default) || MODEL_OPTIONS[0];
}

/**
 * Get all models for a specific provider
 * @param {string} provider - Provider name (groq, anthropic, phone)
 * @returns {array} Array of model configurations
 */
export function getModelsByProvider(provider) {
  return MODEL_OPTIONS.filter(m => m.provider === provider);
}

/**
 * Validate if a model ID exists
 * @param {string} modelId - Model identifier to validate
 * @returns {boolean} True if model exists
 */
export function isValidModelId(modelId) {
  return MODEL_OPTIONS.some(m => m.id === modelId);
}

/**
 * Get model display info for UI
 * @param {string} modelId - Model identifier
 * @returns {object} Display information
 */
export function getModelDisplayInfo(modelId) {
  const model = getModelById(modelId);
  if (!model) return null;

  return {
    name: model.name,
    provider: model.provider,
    speedLabel: model.speedLabel,
    description: model.description
  };
}
