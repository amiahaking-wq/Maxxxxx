/**
 * Smart Model Routing Engine (Feature #15)
 *
 * Picks the best LLM for a given task based on task type, context size, and
 * available models. This makes MAX model-agnostic — instead of forcing one
 * model for everything, it dynamically selects based on what the task needs.
 *
 * Routing rules:
 *   - Coding tasks (build, fix, refactor)     → use code-tuned models (Qwen Coder, DeepSeek Coder)
 *   - Long context (>8k tokens)               → use 32k+ context models (Llama 3.1 70B, Mistral Large)
 *   - Vision tasks (image attached)           → use vision models (Llama 3.2 Vision, Gemini Flash)
 *   - Simple chat / short responses           → use fast cheap models (Llama 3.1 8B, Gemini Flash)
 *   - Reasoning tasks (math, analysis)        → use reasoning models (DeepSeek R1, Qwen QwQ)
 *   - Tool use (function calling)             → use FC-supporting models (auto, Llama 3.1, Mistral)
 *
 * Falls back to openrouter/auto if no specific match.
 */

import logger from '../utils/logger.js';

/**
 * Task type detection from the user's message.
 */
export function detectTaskType(message) {
  const lower = (message || '').toLowerCase();

  // Vision task — image is attached
  if (lower.includes('[image') || lower.includes('analyze this image') || lower.includes('what is in this picture')) {
    return 'vision';
  }

  // Coding tasks
  if (/\b(build|create|make|write|fix|refactor|debug|implement|develop|code|function|class|api endpoint|component|landing page|web app|website|html|css|javascript|python|react|vue|svelte|node|express|sql|database)\b/i.test(lower)) {
    return 'coding';
  }

  // Reasoning tasks
  if (/\b(solve|prove|derive|calculate|analyze|compare|evaluate|reason|step by step|why does|how does .* work|mathematical|theorem|proof)\b/i.test(lower)) {
    return 'reasoning';
  }

  // Long context — based on message length
  if (message && message.length > 4000) {
    return 'long_context';
  }

  // Tool use — explicit request to use a tool
  if (/\b(search|browse|web|fetch|api|github|database|email|calendar)\b/i.test(lower)) {
    return 'tool_use';
  }

  // Default — simple chat
  return 'chat';
}

/**
 * Model preference by task type. Each entry is a list of model IDs (in order
 * of preference) that work well for that task type. The router picks the
 * first available model from the list.
 *
 * These are OpenRouter model IDs — they all support the free tier.
 */
const MODEL_PREFERENCES = {
  coding: [
    'openrouter/qwen/qwen-2.5-coder-32b-instruct:free',
    'openrouter/deepseek/deepseek-coder',
    'openrouter/qwen/qwen-2.5-coder-32b-instruct',
    'openrouter/deepseek/deepseek-r1:free',
    'openrouter/auto'
  ],
  reasoning: [
    'openrouter/deepseek/deepseek-r1:free',
    'openrouter/qwen/qwen-2.5-72b-instruct:free',
    'openrouter/qwen/qwen-qwq-32b-preview:free',
    'openrouter/deepseek/deepseek-r1',
    'openrouter/auto'
  ],
  vision: [
    'openrouter/llama/llama-3.2-11b-vision-instruct:free',
    'openrouter/qwen/qwen-2-vl-72b-instruct',
    'openrouter/google/gemini-flash-1.5',
    'openrouter/auto'
  ],
  long_context: [
    'openrouter/meta-llama/llama-3.1-70b-instruct',
    'openrouter/mistralai/mistral-large',
    'openrouter/qwen/qwen-2.5-72b-instruct:free',
    'openrouter/google/gemini-flash-1.5',
    'openrouter/auto'
  ],
  tool_use: [
    'openrouter/auto',  // auto is great at tool use
    'openrouter/meta-llama/llama-3.1-70b-instruct',
    'openrouter/mistralai/mistral-large',
    'openrouter/qwen/qwen-2.5-72b-instruct:free'
  ],
  chat: [
    'openrouter/auto',
    'openrouter/meta-llama/llama-3.1-8b-instruct:free',
    'openrouter/google/gemini-flash-1.5',
    'openrouter/mistralai/mistral-7b-instruct:free'
  ]
};

/**
 * Get the recommended model for a given task type.
 * Returns the first model from the preference list.
 */
export function getRecommendedModel(taskType) {
  const prefs = MODEL_PREFERENCES[taskType] || MODEL_PREFERENCES.chat;
  return prefs[0];
}

/**
 * Route a task to the best model.
 *
 * @param {string} message - the user's task
 * @param {Object} options - { hasImage, hasFiles, userPreference }
 * @returns {Object} { model, taskType, reason }
 */
export function routeTask(message, options = {}) {
  let taskType = detectTaskType(message);

  // Override: if image is attached, force vision
  if (options.hasImage) taskType = 'vision';

  // Override: if user has a strong preference, respect it (but log the override)
  if (options.userPreference && options.userPreference !== 'auto' && options.userPreference !== 'openrouter/auto') {
    logger.info('MODEL_ROUTING_OVERRIDE', {
      taskType,
      userPreference: options.userPreference,
      recommended: getRecommendedModel(taskType)
    });
    return {
      model: options.userPreference,
      taskType,
      reason: `User preference override (task type was ${taskType})`
    };
  }

  const model = getRecommendedModel(taskType);
  logger.info('MODEL_ROUTING', { taskType, model });

  return {
    model,
    taskType,
    reason: `Selected for ${taskType} task`
  };
}

/**
 * Check if a model supports function calling.
 * (Used by the ReAct loop to decide between FC and ReAct text format.)
 */
export function supportsFunctionCalling(modelId) {
  const lower = (modelId || '').toLowerCase();
  // Non-FC models
  if (/deepseek-r1|o1|o3/.test(lower)) return false;
  // FC-supporting models
  if (/auto|llama|mistral|qwen|gemini|claude|gpt|groq|kimi|glm|gpt-oss/.test(lower)) return true;
  return false;
}

export default { detectTaskType, routeTask, getRecommendedModel, supportsFunctionCalling };
