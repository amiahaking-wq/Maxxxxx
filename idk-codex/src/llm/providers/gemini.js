/**
 * Google Gemini LLM Provider
 * Supports: gemini-1.5-pro, gemini-1.5-flash
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from '../../utils/logger.js';

export class GeminiProvider {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY is required');
    }
    this.client = new GoogleGenerativeAI(apiKey);
    this.name = 'gemini';
    this.models = {
      'gemini-1.5-pro': {
        maxTokens: 2000000,
        contextWindow: 2000000,
        inputCost: 0.00125,
        outputCost: 0.005
      },
      'gemini-1.5-flash': {
        maxTokens: 1000000,
        contextWindow: 1000000,
        inputCost: 0.000075,
        outputCost: 0.0003
      },
      'gemini-2.0-flash-exp': {
        maxTokens: 1000000,
        contextWindow: 1000000,
        inputCost: 0,
        outputCost: 0
      }
    };
    this.defaultModel = 'gemini-1.5-pro';
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

      logger.debug('Gemini completion request', {
        model,
        messageCount: messages.length,
        maxTokens: requestMaxTokens
      });

      // Convert messages format for Gemini
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const geminiMessages = conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const generativeModel = this.client.getGenerativeModel({
        model,
        systemInstruction: systemMessage?.content
      });

      const chat = generativeModel.startChat({
        history: geminiMessages.slice(0, -1),
        generationConfig: {
          temperature,
          maxOutputTokens: requestMaxTokens
        }
      });

      const lastMessage = geminiMessages[geminiMessages.length - 1];
      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const response = result.response;

      // Track token usage (approximate for Gemini)
      const inputTokens = this.estimateTokens(messages.map(m => m.content).join(' '));
      const outputTokens = this.estimateTokens(response.text());

      if (budgetManager) {
        budgetManager.addUsage(inputTokens, outputTokens);
      }

      logger.debug('Gemini completion success', {
        model,
        inputTokens,
        outputTokens
      });

      return {
        content: response.text(),
        model,
        provider: this.name,
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens
        },
        finishReason: 'stop'
      };
    } catch (error) {
      logger.error('Gemini completion failed', {
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

export default GeminiProvider;
