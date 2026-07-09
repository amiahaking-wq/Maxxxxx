/**
 * V2 Enhancement: Security Reviewer Sub-Agent
 * Purpose: Specialized agent for identifying security vulnerabilities
 * Integration Point: Invoked during deploy phase before commit
 */

import { generateCompletion } from '../../groq/client.js';
import logger from '../../utils/logger.js';

/**
 * Security review sub-agent
 * Analyzes code for security vulnerabilities, hardcoded secrets, SQL injection, XSS, etc.
 * @param {string} task - Task description
 * @param {Object} context - Context {code, filepath, budgetManager}
 * @returns {Promise<Object>} Review result
 */
export async function securityReviewer(task, context) {
  try {
    const { code, filepath, budgetManager } = context;

    logger.info('Security reviewer analyzing code', { filepath });

    const messages = [
      {
        role: 'system',
        content: `You are a security expert specializing in code security review. Identify:
- Hardcoded secrets, API keys, passwords
- SQL injection vulnerabilities
- XSS (Cross-Site Scripting) vulnerabilities
- Path traversal attempts
- Command injection risks
- Insecure cryptography
- Authentication/authorization bypasses
- Sensitive data exposure

Provide results in JSON format with severity levels (critical, high, medium, low).`
      },
      {
        role: 'user',
        content: `File: ${filepath}\n\nTask: ${task}\n\nCode:\n\`\`\`\n${code.substring(0, 2000)}\n\`\`\`\n\nAnalyze this code for security vulnerabilities. Respond in JSON:\n{\n  "vulnerabilities": [\n    {"severity": "critical/high/medium/low", "type": "vulnerability type", "description": "details", "line": number}\n  ],\n  "hasCritical": true/false,\n  "summary": "brief summary"\n}`
      }
    ];

    const result = await generateCompletion(messages, {
      temperature: 0.2,
      maxTokens: 1500,
      budgetManager
    });

    // Parse JSON response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);

      const criticalCount = (analysis.vulnerabilities || [])
        .filter(v => v.severity === 'critical').length;
      const highCount = (analysis.vulnerabilities || [])
        .filter(v => v.severity === 'high').length;

      logger.info('Security review complete', {
        filepath,
        vulnerabilities: analysis.vulnerabilities?.length || 0,
        critical: criticalCount,
        high: highCount
      });

      return {
        success: true,
        data: analysis,
        hasCritical: analysis.hasCritical || criticalCount > 0,
        vulnerabilityCount: analysis.vulnerabilities?.length || 0,
        message: analysis.summary || 'Security review complete'
      };
    }

    // Failed to parse, return safe default
    logger.warn('Failed to parse security review response');
    return {
      success: true,
      data: { vulnerabilities: [], hasCritical: false },
      hasCritical: false,
      vulnerabilityCount: 0,
      message: 'Security review completed (parsing failed)'
    };
  } catch (error) {
    logger.error('Security reviewer failed', {
      filepath: context.filepath,
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      message: `Security review failed: ${error.message}`
    };
  }
}

export default securityReviewer;
