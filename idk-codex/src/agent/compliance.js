/**
 * V2 Enhancement: CLAUDE.md Compliance Checker
 * Purpose: Validate code against project coding principles
 * Integration Point: Called during execute and deploy phases
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { generateCompletion } from '../groq/client.js';
import logger from '../utils/logger.js';

const CLAUDE_MD_PATH = process.env.CLAUDE_MD_PATH || './CLAUDE.md';

/**
 * Load CLAUDE.md content
 * @returns {Promise<string|null>} CLAUDE.md content or null if not found
 */
async function loadClaudeMd() {
  try {
    const content = await fs.readFile(CLAUDE_MD_PATH, 'utf-8');
    logger.debug('Loaded CLAUDE.md', { length: content.length });
    return content;
  } catch (error) {
    logger.warn('CLAUDE.md not found, compliance checking disabled', {
      path: CLAUDE_MD_PATH,
      error: error.message
    });
    return null;
  }
}

/**
 * Validate code compliance against CLAUDE.md principles
 * @param {string} code - Code to validate
 * @param {string} filepath - File path (for context)
 * @param {Object} budgetManager - Optional token budget manager
 * @returns {Promise<Object>} Compliance result {compliant, violations, warnings}
 */
export async function validateCompliance(code, filepath = 'unknown', budgetManager = null) {
  try {
    // Check if enforcement is enabled
    const enforceCompliance = process.env.CLAUDE_MD_ENFORCE !== 'false';
    if (!enforceCompliance) {
      logger.debug('CLAUDE.md enforcement disabled');
      return { compliant: true, violations: [], warnings: [] };
    }

    // Load CLAUDE.md
    const claudeMd = await loadClaudeMd();
    if (!claudeMd) {
      // If CLAUDE.md doesn't exist, pass by default
      return { compliant: true, violations: [], warnings: [] };
    }

    logger.info('Checking code compliance', { filepath });

    // Perform quick static checks first
    const staticViolations = performStaticChecks(code, filepath);

    // If critical violations found, don't need AI check
    if (staticViolations.length > 0) {
      logger.warn('Static compliance violations found', {
        filepath,
        violationCount: staticViolations.length
      });
      return {
        compliant: false,
        violations: staticViolations,
        warnings: []
      };
    }

    // Use AI to check deeper compliance
    const aiResult = await performAICheck(code, filepath, claudeMd, budgetManager);

    logger.info('Compliance check complete', {
      filepath,
      compliant: aiResult.compliant,
      violationCount: aiResult.violations.length,
      warningCount: aiResult.warnings.length
    });

    return aiResult;
  } catch (error) {
    logger.error('Compliance check failed', { filepath, error: error.message });

    // Check fail-closed setting (default to fail-closed for security)
    const failClosed = process.env.CLAUDE_MD_FAIL_CLOSED !== 'false';

    if (failClosed) {
      // Fail-closed: reject on error
      return {
        compliant: false,
        violations: [`Compliance check failed: ${error.message}`],
        warnings: []
      };
    } else {
      // Fail-open: allow on error
      return {
        compliant: true,
        violations: [],
        warnings: [`Compliance check failed: ${error.message}`]
      };
    }
  }
}

/**
 * Perform static compliance checks (fast, no AI)
 * @param {string} code - Code to check
 * @param {string} filepath - File path
 * @returns {Array<string>} List of violations
 */
function performStaticChecks(code, filepath) {
  const violations = [];

  // Check for console.log usage
  if (code.includes('console.log') || code.includes('console.error')) {
    violations.push('Uses console.log/error instead of logger');
  }

  // Check for hardcoded secrets patterns
  const secretPatterns = [
    /apiKey\s*=\s*['"][^'"]+['"]/i,
    /api_key\s*=\s*['"][^'"]+['"]/i,
    /password\s*=\s*['"][^'"]+['"]/i,
    /secret\s*=\s*['"][^'"]+['"]/i,
    /token\s*=\s*['"][^'"]+['"]/i
  ];

  for (const pattern of secretPatterns) {
    if (pattern.test(code)) {
      violations.push('Contains potential hardcoded secrets');
      break;
    }
  }

  // Check for relative paths in file operations
  if (filepath.endsWith('.js') || filepath.endsWith('.ts')) {
    if (code.match(/readFile\s*\(\s*['"]\.\.?\//)) {
      violations.push('Uses relative paths in file operations');
    }
  }

  // Check for missing error handling on async operations
  const asyncFunctionMatches = code.match(/async\s+function\s+\w+/g);
  if (asyncFunctionMatches) {
    const hasTryCatch = code.includes('try {') && code.includes('catch');
    if (!hasTryCatch) {
      violations.push('Async function missing try-catch error handling');
    }
  }

  return violations;
}

/**
 * Perform AI-powered compliance check
 * @param {string} code - Code to check
 * @param {string} filepath - File path
 * @param {string} claudeMd - CLAUDE.md content
 * @param {Object} budgetManager - Token budget manager
 * @returns {Promise<Object>} Compliance result
 */
async function performAICheck(code, filepath, claudeMd, budgetManager) {
  try {
    const messages = [
      {
        role: 'system',
        content: 'You are a code compliance checker. Review code against the project principles and identify violations.'
      },
      {
        role: 'user',
        content: `Project Principles:\n\n${claudeMd}\n\n---\n\nFile: ${filepath}\n\nCode:\n\`\`\`\n${code.substring(0, 3000)}\n\`\`\`\n\nAnalyze this code for compliance violations. Respond in JSON format with:\n{\n  "compliant": true/false,\n  "violations": ["violation 1", "violation 2"],\n  "warnings": ["warning 1"]\n}\n\nViolations are critical issues. Warnings are suggestions for improvement.`
      }
    ];

    const result = await generateCompletion(messages, {
      temperature: 0.2,
      maxTokens: 1000,
      budgetManager
    });

    // Parse JSON response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        compliant: parsed.compliant !== false, // Default to true if not specified
        violations: parsed.violations || [],
        warnings: parsed.warnings || []
      };
    }

    // Failed to parse, assume compliant
    return {
      compliant: true,
      violations: [],
      warnings: ['Failed to parse compliance check response']
    };
  } catch (error) {
    logger.error('AI compliance check failed', { error: error.message });
    return {
      compliant: true,
      violations: [],
      warnings: [`AI check error: ${error.message}`]
    };
  }
}

/**
 * Format compliance violations for display
 * @param {Object} result - Compliance result
 * @returns {string} Formatted message
 */
export function formatComplianceReport(result) {
  const sections = [];

  if (result.compliant) {
    sections.push('✅ Code complies with CLAUDE.md principles');
  } else {
    sections.push('❌ Code has compliance violations:');
    sections.push('');
    result.violations.forEach((v, idx) => {
      sections.push(`${idx + 1}. ${v}`);
    });
  }

  if (result.warnings && result.warnings.length > 0) {
    sections.push('');
    sections.push('⚠️  Warnings:');
    result.warnings.forEach((w, idx) => {
      sections.push(`${idx + 1}. ${w}`);
    });
  }

  return sections.join('\n');
}

export default {
  validateCompliance,
  formatComplianceReport
};
