/**
 * V2 Enhancement: Documentation Writer Sub-Agent
 * Purpose: Specialized agent for writing inline comments and docstrings
 * Integration Point: Invoked during deploy phase if budget allows
 */

import { generateCompletion } from '../../groq/client.js';
import logger from '../../utils/logger.js';

/**
 * Documentation writer sub-agent
 * Generates inline comments and JSDoc docstrings for code
 * @param {string} task - Task description
 * @param {Object} context - Context {code, filepath, budgetManager}
 * @returns {Promise<Object>} Documented code result
 */
export async function documentationWriter(task, context) {
  try {
    const { code, filepath, budgetManager } = context;

    logger.info('Documentation writer enhancing code', { filepath });

    const messages = [
      {
        role: 'system',
        content: `You are a documentation expert. Add comprehensive documentation to code:
- JSDoc comments for all functions with @param, @returns, @throws
- Inline comments explaining complex logic
- Class and module-level documentation
- Example usage where helpful

Follow best practices:
- Clear, concise descriptions
- Document edge cases and assumptions
- Explain the "why", not just the "what"
- Use proper JSDoc syntax`
      },
      {
        role: 'user',
        content: `File: ${filepath}\n\nTask: ${task}\n\nCode to document:\n\`\`\`\n${code.substring(0, 2000)}\n\`\`\`\n\nAdd comprehensive documentation. Return only the documented code without explanations.`
      }
    ];

    const result = await generateCompletion(messages, {
      temperature: 0.3,
      maxTokens: 2000,
      budgetManager
    });

    // Extract documented code
    let documentedCode = result.content;
    const codeMatch = result.content.match(/```(?:javascript|js|typescript|ts)?\n?([\s\S]*?)```/);
    if (codeMatch) {
      documentedCode = codeMatch[1].trim();
    }

    // Count added documentation
    const docStats = analyzeDocumentation(code, documentedCode);

    logger.info('Documentation enhancement complete', {
      filepath,
      ...docStats
    });

    return {
      success: true,
      data: {
        documentedCode,
        stats: docStats
      },
      message: `Added ${docStats.jsdocCount} JSDoc comments and ${docStats.inlineCount} inline comments`
    };
  } catch (error) {
    logger.error('Documentation writer failed', {
      filepath: context.filepath,
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      message: `Documentation generation failed: ${error.message}`
    };
  }
}

/**
 * Analyze documentation changes
 * @param {string} originalCode - Original code
 * @param {string} documentedCode - Documented code
 * @returns {Object} Documentation statistics
 */
function analyzeDocumentation(originalCode, documentedCode) {
  const originalJsDoc = (originalCode.match(/\/\*\*/g) || []).length;
  const newJsDoc = (documentedCode.match(/\/\*\*/g) || []).length;

  const originalInline = (originalCode.match(/\/\//g) || []).length;
  const newInline = (documentedCode.match(/\/\//g) || []).length;

  return {
    jsdocCount: Math.max(0, newJsDoc - originalJsDoc),
    inlineCount: Math.max(0, newInline - originalInline),
    totalAdded: Math.max(0, (newJsDoc - originalJsDoc) + (newInline - originalInline))
  };
}

export default documentationWriter;
