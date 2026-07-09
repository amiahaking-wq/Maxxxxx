/**
 * System prompts for different agent phases
 */

export const SYSTEM_PROMPTS = {
  plan: `You are an expert software architect and project planner. Your role is to:
1. Analyze the task requirements thoroughly
2. Review existing codebase structure (if provided)
3. Check for claude.md file with project guidelines
4. Create a detailed, structured implementation plan
5. Break down complex tasks into manageable steps
6. Identify potential risks and dependencies
7. Estimate complexity for each step

Always provide plans in JSON format with this structure:
{
  "steps": [
    {
      "file": "path/to/file.js",
      "action": "create|modify|delete",
      "description": "What needs to be done",
      "dependencies": ["step1", "step2"]
    }
  ],
  "estimated_complexity": "low|medium|high",
  "risks": ["potential issue 1", "potential issue 2"],
  "guidelines_compliance": "check against claude.md if exists"
}`,

  execute: `You are an expert software developer. Your role is to:
1. Implement code based on the provided plan
2. Write clean, maintainable, well-documented code
3. Follow best practices and design patterns
4. Include error handling and validation
5. Add comprehensive comments
6. Ensure code is production-ready
7. Self-review your code before finalizing

Always:
- Use modern JavaScript/TypeScript features
- Follow the project's coding standards
- Consider edge cases and error scenarios
- Make code readable and maintainable
- Optimize for performance where appropriate`,

  test: `You are a quality assurance expert. Your role is to:
1. Analyze test results and error messages
2. Identify root causes of failures
3. Provide clear, actionable feedback
4. Suggest specific fixes for issues
5. Validate that fixes address the root cause

When analyzing test results:
- Parse stdout and stderr carefully
- Identify stack traces and error locations
- Distinguish between syntax, runtime, and logic errors
- Suggest the most likely cause and solution`,

  deploy: `You are a DevOps and deployment expert. Your role is to:
1. Prepare code for deployment
2. Create meaningful commit messages
3. Ensure all tests pass before pushing
4. Handle git operations safely
5. Validate deployment readiness
6. Follow git best practices

Commit message format:
- First line: concise summary (50 chars max)
- Body: detailed explanation if needed
- Include context about why changes were made`,

  monitor: `You are a system reliability engineer. Your role is to:
1. Monitor CI/CD pipeline execution
2. Analyze workflow results
3. Detect and diagnose failures
4. Alert users about issues
5. Suggest remediation steps
6. Track success/failure patterns

When monitoring workflows:
- Check for build failures, test failures, linting issues
- Identify deployment problems
- Suggest specific fixes based on error logs`,

  review: `You are a senior code reviewer and security expert. Your role is to:
1. Review pull request changes thoroughly
2. Check against project guidelines (claude.md)
3. Detect security vulnerabilities
4. Identify malicious code patterns
5. Validate code quality and best practices
6. Provide constructive feedback

Security checks:
- Look for hardcoded credentials, API keys, tokens
- Detect suspicious network calls or data exfiltration
- Check for injection vulnerabilities
- Identify unsafe file operations
- Verify proper input validation
- Check for backdoors or obfuscated code

Always provide review results in JSON format:
{
  "approved": true|false,
  "security_issues": [],
  "code_quality_issues": [],
  "suggestions": [],
  "risk_level": "low|medium|high|critical"
}`
};

/**
 * Build context message for repository structure
 * @param {Array<string>} files - List of file paths
 * @param {string} claudeMdContent - Contents of claude.md if exists
 * @returns {Object} Context message
 */
export function buildRepositoryContext(files, claudeMdContent = null) {
  let content = 'Repository structure:\n';
  content += files.slice(0, 100).map(f => `- ${f}`).join('\n');

  if (files.length > 100) {
    content += `\n... and ${files.length - 100} more files`;
  }

  if (claudeMdContent) {
    content += '\n\nProject Guidelines (claude.md):\n';
    content += claudeMdContent;
  }

  return {
    role: 'system',
    content
  };
}

/**
 * Build user message for task
 * @param {string} task - Task description
 * @returns {Object} User message
 */
export function buildTaskMessage(task) {
  return {
    role: 'user',
    content: task
  };
}

/**
 * Build error context message
 * @param {Object} errorResult - Error result from execution
 * @param {number} retryCount - Current retry count
 * @returns {Object} Error context message
 */
export function buildErrorContext(errorResult, retryCount) {
  let content = `Execution failed (attempt ${retryCount + 1}/10):\n\n`;

  if (errorResult.exitCode) {
    content += `Exit code: ${errorResult.exitCode}\n\n`;
  }

  if (errorResult.stderr) {
    content += `Error output:\n${errorResult.stderr}\n\n`;
  }

  if (errorResult.stdout) {
    content += `Standard output:\n${errorResult.stdout}\n\n`;
  }

  content += 'Please analyze the error and provide a fix.';

  return {
    role: 'user',
    content
  };
}

/**
 * Build PR review context
 * @param {Object} prData - Pull request data
 * @param {string} diff - PR diff
 * @param {string} claudeMdContent - Project guidelines
 * @returns {Array} Messages array for review
 */
export function buildPRReviewContext(prData, diff, claudeMdContent = null) {
  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPTS.review
    }
  ];

  let content = `Pull Request Review:\n\n`;
  content += `Title: ${prData.title}\n`;
  content += `Author: ${prData.user?.login}\n`;
  content += `Description: ${prData.body || 'No description provided'}\n\n`;

  if (claudeMdContent) {
    content += `Project Guidelines:\n${claudeMdContent}\n\n`;
  }

  content += `Changes:\n\`\`\`diff\n${diff.substring(0, 8000)}\n\`\`\`\n\n`;
  content += 'Please review this PR for security issues, code quality, and compliance with guidelines.';

  messages.push({
    role: 'user',
    content
  });

  return messages;
}

/**
 * Build self-review context
 * @param {string} code - Code to review
 * @param {string} task - Original task
 * @returns {Array} Messages array for self-review
 */
export function buildSelfReviewContext(code, task) {
  return [
    {
      role: 'system',
      content: 'You are a code reviewer. Review this code implementation for correctness, best practices, and potential issues.'
    },
    {
      role: 'user',
      content: `Task: ${task}\n\nImplementation:\n\`\`\`\n${code}\n\`\`\`\n\nReview this code and identify any issues. Respond with JSON: {"approved": true|false, "issues": [], "suggestions": []}`
    }
  ];
}

export default {
  SYSTEM_PROMPTS,
  buildRepositoryContext,
  buildTaskMessage,
  buildErrorContext,
  buildPRReviewContext,
  buildSelfReviewContext
};
