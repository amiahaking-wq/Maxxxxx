/**
 * Anthropic Claude LLM Provider
 * Supports: claude-3-5-sonnet-20241022, claude-3-opus-20240229
 */

import Anthropic from '@anthropic-ai/sdk';
import logger from '../../utils/logger.js';

export class AnthropicProvider {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }
    this.client = new Anthropic({ apiKey });
    this.name = 'anthropic';
    this.models = {
      'claude-3-5-sonnet-20241022': {
        maxTokens: 200000,
        contextWindow: 200000,
        inputCost: 0.003,
        outputCost: 0.015
      },
      'claude-3-opus-20240229': {
        maxTokens: 200000,
        contextWindow: 200000,
        inputCost: 0.015,
        outputCost: 0.075
      },
      'claude-3-sonnet-20240229': {
        maxTokens: 200000,
        contextWindow: 200000,
        inputCost: 0.003,
        outputCost: 0.015
      }
    };
    this.defaultModel = 'claude-3-5-sonnet-20241022';
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
        max_tokens = 4096,
        budgetManager
      } = options;

      const modelInfo = this.getModelInfo(model);
      const requestMaxTokens = Math.min(max_tokens, modelInfo.maxTokens);

      logger.debug('Anthropic completion request', {
        model,
        messageCount: messages.length,
        maxTokens: requestMaxTokens
      });

      // Convert messages format (Anthropic requires system message separate)
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const requestOptions = {
        model,
        messages: conversationMessages,
        temperature,
        max_tokens: requestMaxTokens
      };

      if (systemMessage) {
        requestOptions.system = systemMessage.content;
      }

      const completion = await this.client.messages.create(requestOptions);

      // Track token usage
      if (budgetManager && completion.usage) {
        budgetManager.addUsage(
          completion.usage.input_tokens,
          completion.usage.output_tokens
        );
      }

      logger.debug('Anthropic completion success', {
        model,
        inputTokens: completion.usage?.input_tokens,
        outputTokens: completion.usage?.output_tokens
      });

      return {
        content: completion.content[0].text,
        model,
        provider: this.name,
        usage: {
          prompt_tokens: completion.usage.input_tokens,
          completion_tokens: completion.usage.output_tokens,
          total_tokens: completion.usage.input_tokens + completion.usage.output_tokens
        },
        finishReason: completion.stop_reason
      };
    } catch (error) {
      logger.error('Anthropic completion failed', {
        error: error.message,
        model: options.model
      });
      throw error;
    }
  }

  /**
   * Estimate token count (Claude's approximation)
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

export default AnthropicProvider;
