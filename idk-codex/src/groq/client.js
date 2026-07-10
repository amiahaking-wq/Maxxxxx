import adapter from '../llm/adapter.js';
import logger from '../utils/logger.js';

const DEFAULT_MODEL = process.env.GROQ_MODEL || undefined;

/**
 * Generate completion
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
      budgetManager = null
    } = options;

    logger.info('Generating completion', {
      model,
      temperature,
      messageCount: messages.length
    });

    if (stream && onChunk) {
      logger.warn('Streaming is not supported by the unified adapter; falling back to non-streaming');
    }

    const result = await adapter.createCompletion({
      messages,
      model,
      temperature,
      max_tokens: maxTokens,
      response_format: options.response_format,
      budgetManager
    });

    if (budgetManager && result.usage) {
      budgetManager.addUsage(
        result.usage.prompt_tokens || 0,
        result.usage.completion_tokens || 0
      );
    }

    return {
      content: result.content || '',
      finishReason: result.finishReason || 'stop',
      usage: {
        promptTokens: result.usage?.prompt_tokens || 0,
        completionTokens: result.usage?.completion_tokens || 0,
        totalTokens: result.usage?.total_tokens || 0
      }
    };
  } catch (error) {
    logger.error('Failed to generate completion', { error: error.message });
    throw error;
  }
}

/**
 * Generate code with optimized settings
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
    temperature: 0.3,
    maxTokens: 8000,
    budgetManager
  });

  // Defensive: some providers may return undefined content
  return result?.content || '';
}

/**
 * Analyze code for issues
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
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    logger.warn('Failed to parse code analysis JSON', { error: error.message });
  }

  return {
    issues: [],
    suggestions: [result.content],
    security_concerns: [],
    quality_score: 5
  };
}

/**
 * Generate plan from task description
 */
export async function generatePlan(task, repoContext = '', budgetManager = null) {
  const messages = [
    {
      role: 'system',
      content: 'You are a software architect. Create detailed implementation plans. Break down tasks into concrete steps with file paths and descriptions. You MUST respond with ONLY a JSON object, no markdown, no explanation.'
    },
    {
      role: 'user',
      content: `Repository context:\n${repoContext}\n\nTask: ${task}\n\nCreate a detailed plan in JSON format with fields: steps (array of {file, action, description}), estimated_complexity (low/medium/high), risks (array). Respond with ONLY the JSON.`
    }
  ];

  const result = await generateCompletion(messages, {
    temperature: 0.4,
    maxTokens: 6000,
    budgetManager
  });

  // Defensive: some providers (phone/Ollama) may return undefined content
  const content = result?.content || '';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Validate the plan has steps
      if (parsed.steps && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        return parsed;
      }
    }
  } catch (error) {
    logger.warn('Failed to parse plan JSON', { error: error.message, contentPreview: content.substring(0, 200) });
  }

  // Fallback: create a single-step plan based on the task
  // Detect file type from the task text
  const t = (task || '').toLowerCase();
  let fileName = 'output.txt';
  if (t.includes('html') || t.includes('web page') || t.includes('landing')) fileName = 'index.html';
  else if (t.includes('python') || t.includes('.py')) fileName = 'main.py';
  else if (t.includes('javascript') || t.includes('.js') || t.includes('node')) fileName = 'index.js';
  else if (t.includes('react') || t.includes('component')) fileName = 'Component.jsx';
  else if (t.includes('css') || t.includes('style')) fileName = 'styles.css';
  else if (t.includes('readme') || t.includes('documentation')) fileName = 'README.md';

  logger.info('Using fallback plan', { fileName, taskPreview: (task || '').substring(0, 100) });

  return {
    steps: [
      {
        file: fileName,
        action: 'create',
        description: task || 'Create the requested file'
      }
    ],
    estimated_complexity: 'medium',
    risks: []
  };
}

/**
 * Fix errors based on error messages
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
    temperature: 0.2 + (retryCount * 0.05),
    maxTokens: 8000,
    budgetManager
  });

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
