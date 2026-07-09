import Groq from 'groq-sdk';
import logger from '../utils/logger.js';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Use the non-deprecated model
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

/**
 * Generate completion with streaming support
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Completion result
 */
export async function generateCompletion(messages, options = {}) {
  try {
    const {
      model = DEFAULT_MODEL,
      temperature = 0.7,
      maxTokens = 8000,
      stream = false,
      onChunk = null,
      budgetManager = null // V2 Enhancement: Token budget tracking
    } = options;

    logger.info('Generating completion', { model, messageCount: messages.length });

    if (stream && onChunk) {
      return await streamCompletion(messages, { model, temperature, maxTokens, onChunk, budgetManager });
    }

    const completion = await groq.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    });

    const response = {
      content: completion.choices[0]?.message?.content || '',
      finishReason: completion.choices[0]?.finish_reason,
      usage: {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0
      }
    };

    logger.logGroqAPI(model, response.usage.totalTokens);

    // V2 Enhancement: Track token usage in budget manager
    if (budgetManager) {
      budgetManager.addUsage(response.usage.promptTokens, response.usage.completionTokens);
    }

    return response;
  } catch (error) {
    logger.error('Failed to generate completion', { error: error.message });
    throw error;
  }
}

/**
 * Stream completion with chunks
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Completion result
 */
async function streamCompletion(messages, options) {
  const { model, temperature, maxTokens, onChunk, budgetManager } = options;

  try {
    const stream = await groq.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    });

    let fullContent = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        if (onChunk) {
          await onChunk(content);
        }
      }

      // Update usage if available
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens || 0,
          completionTokens: chunk.usage.completion_tokens || 0,
          totalTokens: chunk.usage.total_tokens || 0
        };
      }
    }

    logger.logGroqAPI(model, usage.totalTokens);

    // V2 Enhancement: Track token usage in budget manager
    if (budgetManager) {
      budgetManager.addUsage(usage.promptTokens, usage.completionTokens);
    }

    return {
      content: fullContent,
      finishReason: 'stop',
      usage
    };
  } catch (error) {
    logger.error('Failed to stream completion', { error: error.message });
    throw error;
  }
}

/**
 * Generate code with optimized settings
 * @param {string} prompt - Code generation prompt
 * @param {Array} context - Context messages
 * @param {Object} budgetManager - Optional token budget manager
 * @returns {Promise<string>} Generated code
 */
export async function generateCode(prompt, context = [], budgetManager = null) {
  const messages = [
    {
      role: 'system',
      content: 'You are an expert software developer. Generate clean, well-documented, production-ready code. Include comments and follow best practices.'
    },
    ...context,
    {
      role: 'user',
      content: prompt
    }
  ];

  const result = await generateCompletion(messages, {
    temperature: 0.3, // Lower temperature for more consistent code
    maxTokens: 8000,
    budgetManager
  });

  return result.content;
}

/**
 * Analyze code for issues
 * @param {string} code - Code to analyze
 * @param {string} context - Additional context
 * @param {Object} budgetManager - Optional token budget manager
 * @returns {Promise<Object>} Analysis result
 */
export async function analyzeCode(code, context = '', budgetManager = null) {
  const messages = [
    {
      role: 'system',
      content: 'You are an expert code reviewer. Analyze the code for bugs, security issues, and best practice violations. Provide actionable feedback in JSON format.'
    },
    {
      role: 'user',
      content: `${context}\n\nAnalyze this code:\n\n\`\`\`\n${code}\n\`\`\`\n\nProvide analysis in JSON format with fields: issues (array), suggestions (array), security_concerns (array), quality_score (0-10).`
    }
  ];

  const result = await generateCompletion(messages, {
    temperature: 0.2,
    maxTokens: 4000,
    budgetManager
  });

  try {
    // Try to parse JSON response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    logger.warn('Failed to parse code analysis JSON', { error: error.message });
  }

  // Return raw content if parsing fails
  return {
    issues: [],
    suggestions: [result.content],
    security_concerns: [],
    quality_score: 5
  };
}

/**
 * Generate plan from task description
 * @param {string} task - Task description
 * @param {string} repoContext - Repository context
 * @param {Object} budgetManager - Optional token budget manager
 * @returns {Promise<Object>} Plan object
 */
export async function generatePlan(task, repoContext = '', budgetManager = null) {
  const messages = [
    {
      role: 'system',
      content: 'You are a software architect. Create detailed implementation plans. Break down tasks into concrete steps with file paths and descriptions.'
    },
    {
      role: 'user',
      content: `Repository context:\n${repoContext}\n\nTask: ${task}\n\nCreate a detailed plan in JSON format with fields: steps (array of {file, action, description}), estimated_complexity (low/medium/high), risks (array).`
    }
  ];

  const result = await generateCompletion(messages, {
    temperature: 0.4,
    maxTokens: 6000,
    budgetManager
  });

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    logger.warn('Failed to parse plan JSON', { error: error.message });
  }

  // Fallback plan structure
  return {
    steps: [
      {
        file: 'implementation.js',
        action: 'create',
        description: task
      }
    ],
    estimated_complexity: 'medium',
    risks: []
  };
}

/**
 * Fix errors based on error messages
 * @param {string} code - Current code
 * @param {string} errorMessage - Error message from test/execution
 * @param {number} retryCount - Current retry count
 * @param {Object} budgetManager - Optional token budget manager
 * @returns {Promise<string>} Fixed code
 */
export async function fixErrors(code, errorMessage, retryCount = 0, budgetManager = null) {
  const messages = [
    {
      role: 'system',
      content: 'You are a debugging expert. Analyze errors and provide fixed code. Only return the corrected code without explanations.'
    },
    {
      role: 'user',
      content: `Retry attempt ${retryCount + 1}/10\n\nCurrent code:\n\`\`\`\n${code}\n\`\`\`\n\nError:\n${errorMessage}\n\nProvide the fixed code only, without explanations.`
    }
  ];

  const result = await generateCompletion(messages, {
    temperature: 0.2 + (retryCount * 0.05), // Increase temperature with retries
    maxTokens: 8000,
    budgetManager
  });

  // Extract code blocks if present
  const codeMatch = result.content.match(/```(?:javascript|js|typescript|ts)?\n?([\s\S]*?)```/);
  if (codeMatch) {
    return codeMatch[1].trim();
  }

  return result.content.trim();
}

export default {
  generateCompletion,
  generateCode,
  analyzeCode,
  generatePlan,
  fixErrors
};
