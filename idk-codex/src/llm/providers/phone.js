/**
 * Phone Provider - Routes inference to a mobile device via the WebSocket bridge
 * The phone (e.g., Termux running Ollama) connects to /phone-bridge and runs local inference.
 */

import logger from '../../utils/logger.js';

/**
 * Format a chat message array into a single prompt string for local models
 * that don't natively consume chat-formatted messages.
 * @param {Array<Object>} messages - OpenAI-style message array
 * @returns {string} Combined prompt
 */
function messagesToPrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '';
  }

  return messages
    .map(m => {
      const role = m.role || 'user';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${role}: ${content}`;
    })
    .join('\n\n');
}

/**
 * Phone LLM Provider
 */
export class PhoneProvider {
  constructor(phoneBridge) {
    this.name = 'phone';
    this.defaultModel = process.env.PHONE_MODEL || 'phi3:mini';
    this.models = [{ id: this.defaultModel, maxTokens: 8192, contextWindow: 8192 }];
    this.phoneBridge = phoneBridge;
    this.defaultMaxTokens = 2048;
  }

  /**
   * Check if a phone is currently connected and registered
   * @returns {boolean}
   */
  isAvailable() {
    return this.phoneBridge?.isAvailable() === true;
  }

  /**
   * Get model info
   * @returns {Object}
   */
  getModelInfo() {
    return this.models[0] || { maxTokens: 8192, contextWindow: 8192 };
  }

  /**
   * Run inference on the connected phone
   * @param {Object} options - Request options
   * @returns {Promise<Object>} {content, usage, finishReason, model}
   */
  async createCompletion(options) {
    if (!this.isAvailable()) {
      throw new Error('Phone provider is not available; no phone is connected to /phone-bridge');
    }

    const prompt = options.prompt || messagesToPrompt(options.messages);
    if (!prompt) {
      throw new Error('Phone provider requires a prompt or messages');
    }

    const maxTokens = Math.min(
      options.max_tokens || options.maxTokens || this.defaultMaxTokens,
      this.phoneBridge.getCapabilities()?.maxTokens || this.defaultMaxTokens
    );
    const temperature = options.temperature || 0.7;

    logger.info('Phone inference request', {
      provider: this.name,
      model: this.defaultModel,
      promptLength: prompt.length,
      maxTokens
    });

    try {
      const { text, tokensUsed } = await this.phoneBridge.infer(prompt, { maxTokens, temperature });

      const usage = {
        prompt_tokens: 0,
        completion_tokens: tokensUsed || 0,
        total_tokens: tokensUsed || 0
      };

      if (options.budgetManager) {
        options.budgetManager.addUsage(usage.prompt_tokens, usage.completion_tokens);
      }

      return {
        content: text,
        usage,
        finishReason: 'stop',
        model: this.defaultModel,
        provider: this.name
      };
    } catch (error) {
      logger.error('Phone inference failed', {
        provider: this.name,
        error: error.message
      });
      throw error;
    }
  }
}

export default PhoneProvider;
