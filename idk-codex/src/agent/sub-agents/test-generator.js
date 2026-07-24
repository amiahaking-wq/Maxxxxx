/**
 * V2 Enhancement: Test Generator Sub-Agent
 * Purpose: Specialized agent for generating unit tests
 * Integration Point: Invoked during execute phase after code generation
 */

import { generateCompletion } from '../../groq/client.js';
import logger from '../../utils/logger.js';

/**
 * Test generator sub-agent
 * Generates unit tests for code
 * @param {string} task - Task description
 * @param {Object} context - Context {code, filepath, budgetManager}
 * @returns {Promise<Object>} Generated tests result
 */
export async function testGenerator(task, context) {
  try {
    const { code, filepath, budgetManager } = context;

    logger.info('Test generator creating tests', { filepath });

    // Determine test framework based on project
    const testFramework = detectTestFramework(filepath);

    const messages = [
      {
        role: 'system',
        content: `You are a testing expert. Generate comprehensive unit tests using ${testFramework}. Include:
- Happy path tests
- Edge case tests
- Error handling tests
- Input validation tests

Follow best practices:
- Clear test descriptions
- Arrange-Act-Assert pattern
- Mock external dependencies
- Test one thing per test`
      },
      {
        role: 'user',
        content: `File: ${filepath}\n\nTask: ${task}\n\nCode to test:\n\`\`\`\n${code.substring(0, 2000)}\n\`\`\`\n\nGenerate comprehensive unit tests. Return only the test code without explanations.`
      }
    ];

    const result = await generateCompletion(messages, {
      temperature: 0.3,
      maxTokens: 2000,
      budgetManager
    });

    // Extract test code
    let testCode = result.content;
    const codeMatch = result.content.match(/```(?:javascript|js|typescript|ts)?\n?([\s\S]*?)```/);
    if (codeMatch) {
      testCode = codeMatch[1].trim();
    }

    logger.info('Test generation complete', {
      filepath,
      testCodeLength: testCode.length
    });

    return {
      success: true,
      data: {
        testCode,
        framework: testFramework,
        testFilePath: getTestFilePath(filepath)
      },
      message: 'Tests generated successfully'
    };
  } catch (error) {
    logger.error('Test generator failed', {
      filepath: context.filepath,
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      message: `Test generation failed: ${error.message}`
    };
  }
}

/**
 * Detect test framework from filepath or project
 * @param {string} filepath - File path
 * @returns {string} Test framework name
 */
function detectTestFramework(filepath) {
  // Check for common test frameworks
  // For this project, we'll default to a simple assertion-based approach
  if (filepath.includes('test') || filepath.includes('spec')) {
    return 'Node.js assert';
  }

  return 'Node.js assert';
}

/**
 * Get test file path from source file path
 * @param {string} filepath - Source file path
 * @returns {string} Test file path
 */
function getTestFilePath(filepath) {
  // Convert src/foo/bar.js -> src/foo/bar.test.js
  const withoutExt = filepath.replace(/\.(js|ts)$/, '');
  return `${withoutExt}.test.js`;
}

export default testGenerator;
