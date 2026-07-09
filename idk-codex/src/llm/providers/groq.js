/**
 * Groq LLM Provider
 * Supports: llama-3.3-70b-versatile, llama3-70b-8192, mixtral-8x7b-32768
 */

import Groq from 'groq-sdk';
import logger from '../../utils/logger.js';

export class GroqProvider {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is required');
    }
    this.client = new Groq({ apiKey });
    this.name = 'groq';
    this.models = {
      'llama-3.3-70b-versatile': {
        maxTokens: 128000,
        contextWindow: 128000,
        inputCost: 0.00059,
        outputCost: 0.00079
      },
      'llama3-70b-8192': {
        maxTokens: 8192,
        contextWindow: 8192,
        inputCost: 0.00059,
        outputCost: 0.00079
      },
      'mixtral-8x7b-32768': {
        maxTokens: 32768,
        contextWindow: 32768,
        inputCost: 0.00024,
        outputCost: 0.00024
      }
    };
    this.defaultModel = 'llama-3.3-70b-versatile';
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return !!this.client;
  }

  /**
   * Get model info
   */
  getModelInfo(model = this.defaultModel) {
    return this.models[model] || this.models[this.defaultModel];
  }

  /**
   * Create chat completion
   */
  async createCompletion(options) {
    try {
      const {
        messages,
        model = this.defaultModel,
        temperature = 0.3,
        max_tokens,
        response_format,
        budgetManager
      } = options;

      const modelInfo = this.getModelInfo(model);
      const requestMaxTokens = max_tokens || Math.min(2000, modelInfo.maxTokens);

      logger.debug('Groq completion request', {
        model,
        messageCount: messages.length,
        maxTokens: requestMaxTokens
      });

      const requestOptions = {
        model,
        messages,
        temperature,
        max_tokens: requestMaxTokens
      };

      if (response_format) {
        requestOptions.response_format = response_format;
      }

      const completion = await this.client.chat.completions.create(requestOptions);

      // Track token usage
      if (budgetManager && completion.usage) {
        budgetManager.addUsage(
          completion.usage.prompt_tokens,
          completion.usage.completion_tokens
        );
      }

      logger.debug('Groq completion success', {
        model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens
      });

      return {
        content: completion.choices[0].message.content,
        model,
        provider: this.name,
        usage: completion.usage,
        finishReason: completion.choices[0].finish_reason
      };
    } catch (error) {
      logger.error('Groq completion failed', {
        error: error.message,
        model: options.model
      });
      throw error;
    }
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if context fits in model
   */
  fitsInContext(messages, model = this.defaultModel) {
    const modelInfo = this.getModelInfo(model);
    const totalText = messages.map(m => m.content).join(' ');
    const estimatedTokens = this.estimateTokens(totalText);
    return estimatedTokens < modelInfo.contextWindow * 0.8; // 80% safety margin
  }
}

export default GroqProvider;
