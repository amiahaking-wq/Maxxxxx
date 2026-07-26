/**
 * OpenAI-compatible LLM Provider
 * Supports any OpenAI-compatible API endpoint:
 * - OpenAI (api.openai.com)
 * - Together AI, OpenRouter, LM Studio, local inference servers
 */

import logger from '../../utils/logger.js';

export class OpenAICompatibleProvider {
  constructor({ name, baseURL, apiKey, models = [], defaultModel }) {
    if (!baseURL) {
      throw new Error('baseURL is required for OpenAI-compatible provider');
    }

    this.name = name;
    this.baseURL = baseURL.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.models = models;
    this.defaultModel = defaultModel || (models[0] ? models[0].id : null);

    // Build a map for quick model info lookup
    this.modelMap = Object.fromEntries(
      models.map(m => [m.id, { maxTokens: m.maxTokens || 8192, contextWindow: m.contextWindow || 8192, inputCost: m.inputCost || 0, outputCost: m.outputCost || 0 }])
    );
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return !!this.baseURL;
  }

  /**
   * Get model info
   */
  getModelInfo(model = this.defaultModel) {
    return this.modelMap[model] || this.modelMap[this.defaultModel] || { maxTokens: 8192, contextWindow: 8192, inputCost: 0, outputCost: 0 };
  }

  /**
   * Create chat completion using OpenAI-compatible chat/completions endpoint
   */
  async createCompletion(options) {
    try {
      const {
        messages,
        model = this.defaultModel,
        temperature = 0.3,
        max_tokens = 2000,
        response_format,
        tools,
        tool_choice,
        budgetManager
      } = options;

      const modelInfo = this.getModelInfo(model);
      const requestMaxTokens = Math.min(max_tokens, modelInfo.maxTokens);

      const body = {
        model,
        messages,
        temperature,
        max_tokens: requestMaxTokens
      };

      if (response_format) {
        body.response_format = response_format;
      }

      // Add function calling tools if provided
      if (tools && Array.isArray(tools) && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = tool_choice || 'auto';
      }

      const headers = {
        'Content-Type': 'application/json'
      };

      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      // Add OpenRouter-specific headers
      if (this.baseURL.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://maxxxxx-production.up.railway.app';
        headers['X-Title'] = 'MAX Agent';
      }

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI-compatible provider returned ${response.status}: ${errorText}`);
      }

      const completion = await response.json();

      const usage = completion.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      };

      if (budgetManager) {
        budgetManager.addUsage(usage.prompt_tokens, usage.completion_tokens);
      }

      const message = completion.choices?.[0]?.message;

      return {
        content: message?.content || '',
        tool_calls: message?.tool_calls || null,
        model,
        provider: this.name,
        usage,
        finishReason: completion.choices?.[0]?.finish_reason || 'stop'
      };
    } catch (error) {
      logger.error('OpenAI-compatible completion failed', {
        provider: this.name,
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
    return estimatedTokens < modelInfo.contextWindow * 0.8;
  }
}

export default OpenAICompatibleProvider;
