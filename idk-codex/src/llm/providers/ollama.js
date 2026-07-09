/**
 * Ollama local LLM Provider
 * Supports any model exposed via Ollama's REST API
 */

import logger from '../../utils/logger.js';

export class OllamaProvider {
  constructor({ host = 'http://localhost:11434', model = null, models = [] } = {}) {
    this.name = 'ollama';
    this.host = host.replace(/\/$/, '');
    this.defaultModel = model || (models[0] ? models[0].id : null);
    this.models = models;

    // Map known model info if provided via env
    this.modelMap = Object.fromEntries(
      models.map(m => [m.id, {
        maxTokens: m.maxTokens || 8192,
        contextWindow: m.contextWindow || 8192,
        inputCost: m.inputCost || 0,
        outputCost: m.outputCost || 0
      }])
    );
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return !!this.host;
  }

  /**
   * Get model info
   */
  getModelInfo(model = this.defaultModel) {
    return this.modelMap[model] || this.modelMap[this.defaultModel] || { maxTokens: 8192, contextWindow: 8192, inputCost: 0, outputCost: 0 };
  }

  /**
   * Fetch list of available models from the Ollama server
   */
  async listModels() {
    try {
      const response = await fetch(`${this.host}/api/tags`);
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.warn('Failed to list Ollama models', { error: error.message });
      return [];
    }
  }

  /**
   * Create chat completion using Ollama's /api/chat endpoint
   */
  async createCompletion(options) {
    try {
      const {
        messages,
        model = this.defaultModel,
        temperature = 0.3,
        max_tokens = 2000,
        budgetManager
      } = options;

      const modelInfo = this.getModelInfo(model);
      const requestMaxTokens = Math.min(max_tokens, modelInfo.maxTokens);

      logger.debug('Ollama completion request', {
        host: this.host,
        model,
        messageCount: messages.length
      });

      const body = {
        model,
        messages,
        stream: false,
        options: {
          temperature,
          num_predict: requestMaxTokens
        }
      };

      const response = await fetch(`${this.host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama returned ${response.status}: ${errorText}`);
      }

      const completion = await response.json();
      const content = completion.message?.content || '';

      // Ollama exposes token counts in prompt_eval_count and eval_count
      const inputTokens = completion.prompt_eval_count || this.estimateTokens(messages.map(m => m.content).join(' '));
      const outputTokens = completion.eval_count || this.estimateTokens(content);

      const usage = {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      };

      if (budgetManager) {
        budgetManager.addUsage(inputTokens, outputTokens);
      }

      logger.debug('Ollama completion success', {
        model,
        inputTokens,
        outputTokens
      });

      return {
        content,
        model,
        provider: this.name,
        usage,
        finishReason: 'stop'
      };
    } catch (error) {
      logger.error('Ollama completion failed', {
        error: error.message,
        model: options.model,
        host: this.host
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
    return estimatedTokens < modelInfo.contextWindow * 0.8;
  }
}

export default OllamaProvider;
