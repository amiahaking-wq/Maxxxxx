/**
 * Context Manager - keeps LLM prompts within the model's context window
 *
 * For very large codebases (or very long conversation histories) we cannot
 * dump everything into the prompt. This module provides:
 *   - Token estimation using gpt-tokenizer (real BPE), with chars/3.5 fallback
 *   - Message truncation that keeps the most recent context
 *   - Helpers to reserve output tokens and keep a system message
 *   - Integration with the workspace indexer for retrieval-style context
 *
 * The goal is to never exceed the model's context window, and for long repos
 * to use the WorkspaceContext indexer to load only relevant files.
 */

import { resolveModel } from '../llm/model-registry.js';
import logger from '../utils/logger.js';

const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_OUTPUT_RESERVE = 4096;
const CHARS_PER_TOKEN = 4; // Used only for slicing/display fallbacks

// Lazily-loaded gpt-tokenizer encoder (ESM import)
let _encode = null;
let _encodeLoadAttempted = false;

/**
 * Lazily import gpt-tokenizer's `encode` function. Returns null if the
 * package is unavailable so callers can fall back to a heuristic.
 */
async function getEncoder() {
  if (_encodeLoadAttempted) return _encode;
  _encodeLoadAttempted = true;
  try {
    const mod = await import('gpt-tokenizer');
    // The package exports `encode` as a named export
    if (mod && typeof mod.encode === 'function') {
      _encode = mod.encode;
      return _encode;
    }
    // Some versions default-export an object with encode
    if (mod && mod.default && typeof mod.default.encode === 'function') {
      _encode = mod.default.encode;
      return _encode;
    }
  } catch (e) {
    logger.debug('gpt-tokenizer not available, falling back to chars/3.5', { error: e.message });
  }
  return null;
}

// Pre-warm the encoder on module load (best-effort, non-blocking).
// Once loaded, sync calls to estimateTokens() can use it.
getEncoder();

/**
 * Estimate token count of a string (synchronous).
 *
 * Uses gpt-tokenizer's BPE encoder if it has been loaded; otherwise falls
 * back to chars / 3.5 (slightly more accurate than chars/4 for English).
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : JSON.stringify(text);

  if (_encode) {
    try {
      return _encode(str).length;
    } catch {
      // Fall through to heuristic
    }
  }

  // Heuristic fallback: ~3.5 chars per token (slightly better than 4)
  return Math.ceil(str.length / 3.5);
}

/**
 * Async token counter using gpt-tokenizer's real BPE encoder.
 * Guarantees the encoder is loaded before counting. Falls back to chars/3.5
 * if encoding fails or the package is unavailable.
 *
 * @param {string} text
 * @returns {Promise<number>}
 */
export async function estimateTokensAsync(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  const encode = await getEncoder();
  if (encode) {
    try {
      return encode(str).length;
    } catch (e) {
      logger.debug('gpt-tokenizer encode failed, using chars/3.5', { error: e.message });
    }
  }
  return Math.ceil(str.length / 3.5);
}

/**
 * Get the context window for a model/provider pair
 * @param {string} modelId - model id from the registry
 * @param {Object} provider - provider instance
 * @returns {number}
 */
export function getContextWindow(modelId, provider) {
  const modelInfo = resolveModel(modelId);
  if (modelInfo?.contextWindow) return modelInfo.contextWindow;
  if (provider?.getModelInfo) {
    const info = provider.getModelInfo(modelId);
    if (info?.contextWindow) return info.contextWindow;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * Truncate an array of messages so the total input tokens fit within the budget.
 * Always keeps the first system message (if present) and the most recent messages.
 * @param {Array<Object>} messages - OpenAI-style messages
 * @param {number} maxInputTokens - maximum input tokens
 * @returns {Array<Object>} truncated messages
 */
export function truncateMessages(messages, maxInputTokens) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const total = messages.reduce((sum, m) => sum + estimateTokens(m?.content), 0);
  if (total <= maxInputTokens) return messages;

  logger.info('Truncating messages to fit context window', {
    totalTokens: total,
    maxInputTokens,
    messageCount: messages.length
  });

  // Separate system message from the rest
  const systemMessages = messages[0]?.role === 'system' ? [messages[0]] : [];
  const rest = messages[0]?.role === 'system' ? messages.slice(1) : [...messages];

  let currentTokens = systemMessages.reduce((sum, m) => sum + estimateTokens(m?.content), 0);
  const result = [...systemMessages];

  // Walk from the most recent message backwards
  for (let i = rest.length - 1; i >= 0; i--) {
    const msg = rest[i];
    const tokens = estimateTokens(msg?.content);
    if (currentTokens + tokens > maxInputTokens) {
      logger.warn('Dropped older message due to context budget', {
        role: msg.role,
        tokens
      });
      continue;
    }
    result.unshift(msg);
    currentTokens += tokens;
  }

  // If even the system message is too large, truncate it
  if (result.length === 1 && currentTokens > maxInputTokens) {
    const system = result[0];
    const maxChars = maxInputTokens * CHARS_PER_TOKEN;
    system.content = system.content.slice(0, maxChars) + '\n\n[context truncated]';
    return [system];
  }

  return result;
}

/**
 * Compute the safe input budget for a request
 * @param {number} contextWindow
 * @param {number} outputTokens
 * @returns {number}
 */
export function getInputBudget(contextWindow, outputTokens = DEFAULT_OUTPUT_RESERVE) {
  return Math.max(0, contextWindow - outputTokens);
}

/**
 * Context manager class that can be used by the agent to build
 * repository-aware prompts that fit within the model's context window.
 */
export class ContextManager {
  constructor(contextWindow = DEFAULT_CONTEXT_WINDOW, outputReserve = DEFAULT_OUTPUT_RESERVE) {
    this.contextWindow = contextWindow;
    this.outputReserve = outputReserve;
  }

  /**
   * Update the context window for the current model
   * @param {number} contextWindow
   */
  setContextWindow(contextWindow) {
    this.contextWindow = contextWindow;
  }

  /**
   * Get the current input budget
   * @returns {number}
   */
  getInputBudget() {
    return getInputBudget(this.contextWindow, this.outputReserve);
  }

  /**
   * Truncate messages to fit the current context window
   * @param {Array<Object>} messages
   * @returns {Array<Object>}
   */
  fitMessages(messages) {
    return truncateMessages(messages, this.getInputBudget());
  }

  /**
   * Create a prompt that includes a task and a repository context that fits the budget.
   * @param {string} task
   * @param {string} repoContext
   * @param {string} [extraInstructions]
   * @returns {string}
   */
  buildPrompt(task, repoContext, extraInstructions = '') {
    const overhead = estimateTokens(task) + estimateTokens(extraInstructions);
    const budget = this.getInputBudget() - overhead;
    const safeContext = this.truncateText(repoContext, budget);

    return `${extraInstructions ? extraInstructions + '\n\n' : ''}${safeContext}\n\nTask: ${task}`;
  }

  /**
   * Truncate a text block to a token budget
   * @param {string} text
   * @param {number} tokenBudget
   * @returns {string}
   */
  truncateText(text, tokenBudget) {
    if (!text) return '';
    const maxChars = Math.max(0, tokenBudget * CHARS_PER_TOKEN);
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n[context truncated]';
  }
}

export default ContextManager;
