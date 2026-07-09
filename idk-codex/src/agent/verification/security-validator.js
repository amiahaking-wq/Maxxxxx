/**
 * Security Validator - Pass 4 of Quad-Pass Validation
 *
 * Detects security vulnerabilities in code:
 * - Hardcoded secrets (API keys, tokens, passwords)
 * - SQL injection vulnerabilities
 * - Command injection risks
 * - Path traversal attempts
 * - Unsafe deserialization
 * - XSS vulnerabilities
 *
 * Based on Claude Code's security validation system.
 *
 * @module security-validator
 */

import fs from 'fs/promises';
import logger from '../../utils/logger.js';

/**
 * Security patterns to detect
 */
const SECURITY_PATTERNS = {
  // Hardcoded secrets
  hardcodedSecrets: [
    {
      name: 'API Key',
      pattern: /(?:api[_-]?key|apikey|api[_-]?secret)[\s]*[=:]['"]([a-zA-Z0-9_\-]{20,})['"]/gi,
      severity: 'critical',
      message: 'Hardcoded API key detected'
    },
    {
      name: 'AWS Access Key',
      pattern: /AKIA[0-9A-Z]{16}/g,
      severity: 'critical',
      message: 'AWS access key detected'
    },
    {
      name: 'Private Key',
      pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
      severity: 'critical',
      message: 'Private key detected'
    },
    {
      name: 'Password',
      pattern: /(?:password|passwd|pwd)[\s]*[=:]['"]([^'"]{8,})['"]/gi,
      severity: 'critical',
      message: 'Hardcoded password detected'
    },
    {
      name: 'Token',
      pattern: /(?:token|bearer|auth)[\s]*[=:]['"]([a-zA-Z0-9_\-\.]{20,})['"]/gi,
      severity: 'critical',
      message: 'Hardcoded token detected'
    },
    {
      name: 'Database Connection String',
      pattern: /(?:mongodb|mysql|postgres|postgresql):\/\/[^:]+:[^@]+@/gi,
      severity: 'critical',
      message: 'Database credentials in connection string'
    }
  ],

  // SQL Injection
  sqlInjection: [
    {
      name: 'String concatenation in SQL',
      pattern: /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*?\+.*?['"`]/gi,
      severity: 'high',
      message: 'Potential SQL injection via string concatenation'
    },
    {
      name: 'Template literal in SQL',
      pattern: /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*?\$\{/gi,
      severity: 'high',
      message: 'Potential SQL injection via template literal'
    },
    {
      name: 'Raw query execution',
      pattern: /\.(?:query|execute)\s*\(\s*['"`].*?\$\{/gi,
      severity: 'high',
      message: 'Raw SQL query with template literal'
    }
  ],

  // Command Injection
  commandInjection: [
    {
      name: 'exec with user input',
      pattern: /(?:exec|spawn|execSync|spawnSync|eval)\s*\([^)]*(?:\$\{|req\.|params\.|query\.)/gi,
      severity: 'critical',
      message: 'Potential command injection'
    },
    {
      name: 'child_process with template literal',
      pattern: /(?:exec|spawn)\s*\(\s*`[^`]*\$\{/gi,
      severity: 'critical',
      message: 'Command injection via template literal'
    },
    {
      name: 'eval usage',
      pattern: /\beval\s*\(/gi,
      severity: 'high',
      message: 'Unsafe eval() usage'
    }
  ],

  // Path Traversal
  pathTraversal: [
    {
      name: 'Path concatenation',
      pattern: /(?:readFile|writeFile|unlink|mkdir|rmdir)\s*\([^)]*(?:\+|`.*?\$\{)/gi,
      severity: 'high',
      message: 'Potential path traversal via concatenation'
    },
    {
      name: 'Unsanitized path',
      pattern: /(?:path\.join|path\.resolve)\s*\([^)]*(?:req\.|params\.|query\.)/gi,
      severity: 'medium',
      message: 'Path operation with unsanitized user input'
    }
  ],

  // XSS
  xss: [
    {
      name: 'innerHTML assignment',
      pattern: /\.innerHTML\s*=(?![\s]*['"`])/gi,
      severity: 'high',
      message: 'Potential XSS via innerHTML'
    },
    {
      name: 'dangerouslySetInnerHTML',
      pattern: /dangerouslySetInnerHTML\s*=\s*\{\{?\s*__html:/gi,
      severity: 'high',
      message: 'Potential XSS via dangerouslySetInnerHTML'
    }
  ],

  // Unsafe Deserialization
  deserialization: [
    {
      name: 'JSON.parse on user input',
      pattern: /JSON\.parse\s*\([^)]*(?:req\.|params\.|query\.)/gi,
      severity: 'medium',
      message: 'Unsafe deserialization of user input'
    }
  ]
};

/**
 * Security Validator
 */
export class SecurityValidator {
  constructor() {
    this.findings = [];
  }

  /**
   * Validate file for security vulnerabilities
   *
   * @param {string} filePath - Path to file
   * @param {string} code - Code to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateFile(filePath, code) {
    this.findings = [];

    logger.debug('Running security validation', { filePath });

    // Run all security checks
    this.checkHardcodedSecrets(code, filePath);
    this.checkSQLInjection(code, filePath);
    this.checkCommandInjection(code, filePath);
    this.checkPathTraversal(code, filePath);
    this.checkXSS(code, filePath);
    this.checkDeserialization(code, filePath);

    const hasVulnerabilities = this.findings.length > 0;
    const hasCritical = this.findings.some(f => f.severity === 'critical');

    if (hasVulnerabilities) {
      logger.warn('Security vulnerabilities found', {
        filePath,
        count: this.findings.length,
        critical: hasCritical
      });
    } else {
      logger.info('Security validation passed', { filePath });
    }

    return {
      valid: !hasCritical, // Allow medium/high, but block critical
      vulnerabilities: this.findings,
      summary: {
        total: this.findings.length,
        critical: this.findings.filter(f => f.severity === 'critical').length,
        high: this.findings.filter(f => f.severity === 'high').length,
        medium: this.findings.filter(f => f.severity === 'medium').length
      }
    };
  }

  /**
   * Check for hardcoded secrets
   *
   * @param {string} code - Code to check
   * @param {string} filePath - File path
   */
  checkHardcodedSecrets(code, filePath) {
    for (const pattern of SECURITY_PATTERNS.hardcodedSecrets) {
      const matches = [...code.matchAll(pattern.pattern)];

      for (const match of matches) {
        // Skip if it's in a comment or test file
        if (this.isInComment(code, match.index) || this.isTestFile(filePath)) {
          continue;
        }

        // Skip common false positives
        if (this.isFalsePositive(match[0])) {
          continue;
        }

        this.findings.push({
          type: 'hardcoded_secret',
          name: pattern.name,
          severity: pattern.severity,
          message: pattern.message,
          line: this.getLineNumber(code, match.index),
          snippet: this.getSnippet(code, match.index),
          file: filePath
        });
      }
    }
  }

  /**
   * Check for SQL injection vulnerabilities
   *
   * @param {string} code - Code to check
   * @param {string} filePath - File path
   */
  checkSQLInjection(code, filePath) {
    for (const pattern of SECURITY_PATTERNS.sqlInjection) {
      const matches = [...code.matchAll(pattern.pattern)];

      for (const match of matches) {
        if (this.isInComment(code, match.index)) {
          continue;
        }

        this.findings.push({
          type: 'sql_injection',
          name: pattern.name,
          severity: pattern.severity,
          message: pattern.message,
          line: this.getLineNumber(code, match.index),
          snippet: this.getSnippet(code, match.index),
          file: filePath
        });
      }
    }
  }

  /**
   * Check for command injection vulnerabilities
   *
   * @param {string} code - Code to check
   * @param {string} filePath - File path
   */
  checkCommandInjection(code, filePath) {
    for (const pattern of SECURITY_PATTERNS.commandInjection) {
      const matches = [...code.matchAll(pattern.pattern)];

      for (const match of matches) {
        if (this.isInComment(code, match.index)) {
          continue;
        }

        this.findings.push({
          type: 'command_injection',
          name: pattern.name,
          severity: pattern.severity,
          message: pattern.message,
          line: this.getLineNumber(code, match.index),
          snippet: this.getSnippet(code, match.index),
          file: filePath
        });
      }
    }
  }

  /**
   * Check for path traversal vulnerabilities
   *
   * @param {string} code - Code to check
   * @param {string} filePath - File path
   */
  checkPathTraversal(code, filePath) {
    for (const pattern of SECURITY_PATTERNS.pathTraversal) {
      const matches = [...code.matchAll(pattern.pattern)];

      for (const match of matches) {
        if (this.isInComment(code, match.index)) {
          continue;
        }

        this.findings.push({
          type: 'path_traversal',
          name: pattern.name,
          severity: pattern.severity,
          message: pattern.message,
          line: this.getLineNumber(code, match.index),
          snippet: this.getSnippet(code, match.index),
          file: filePath
        });
      }
    }
  }

  /**
   * Check for XSS vulnerabilities
   *
   * @param {string} code - Code to check
   * @param {string} filePath - File path
   */
  checkXSS(code, filePath) {
    // Only check frontend files
    if (!this.isFrontendFile(filePath)) {
      return;
    }

    for (const pattern of SECURITY_PATTERNS.xss) {
      const matches = [...code.matchAll(pattern.pattern)];

      for (const match of matches) {
        if (this.isInComment(code, match.index)) {
          continue;
        }

        this.findings.push({
          type: 'xss',
          name: pattern.name,
          severity: pattern.severity,
          message: pattern.message,
          line: this.getLineNumber(code, match.index),
          snippet: this.getSnippet(code, match.index),
          file: filePath
        });
      }
    }
  }

  /**
   * Check for unsafe deserialization
   *
   * @param {string} code - Code to check
   * @param {string} filePath - File path
   */
  checkDeserialization(code, filePath) {
    for (const pattern of SECURITY_PATTERNS.deserialization) {
      const matches = [...code.matchAll(pattern.pattern)];

      for (const match of matches) {
        if (this.isInComment(code, match.index)) {
          continue;
        }

        this.findings.push({
          type: 'unsafe_deserialization',
          name: pattern.name,
          severity: pattern.severity,
          message: pattern.message,
          line: this.getLineNumber(code, match.index),
          snippet: this.getSnippet(code, match.index),
          file: filePath
        });
      }
    }
  }

  /**
   * Check if position is inside a comment
   *
   * @param {string} code - Full code
   * @param {number} index - Position to check
   * @returns {boolean} True if in comment
   */
  isInComment(code, index) {
    const beforeMatch = code.substring(0, index);
    const lines = beforeMatch.split('\n');
    const currentLine = lines[lines.length - 1];

    // Check for // comment
    if (currentLine.trim().startsWith('//')) {
      return true;
    }

    // Check for /* */ comment
    const lastCommentStart = beforeMatch.lastIndexOf('/*');
    const lastCommentEnd = beforeMatch.lastIndexOf('*/');

    return lastCommentStart > lastCommentEnd;
  }

  /**
   * Check if this is a test file
   *
   * @param {string} filePath - File path
   * @returns {boolean} True if test file
   */
  isTestFile(filePath) {
    return /\.(test|spec)\.(js|ts|jsx|tsx)$/.test(filePath) ||
           filePath.includes('__tests__') ||
           filePath.includes('/tests/');
  }

  /**
   * Check if this is a frontend file
   *
   * @param {string} filePath - File path
   * @returns {boolean} True if frontend file
   */
  isFrontendFile(filePath) {
    return /\.(jsx|tsx|html|vue)$/.test(filePath) ||
           filePath.includes('/frontend/') ||
           filePath.includes('/client/') ||
           filePath.includes('/components/');
  }

  /**
   * Check if match is a false positive
   *
   * @param {string} matchText - Matched text
   * @returns {boolean} True if false positive
   */
  isFalsePositive(matchText) {
    const falsePositives = [
      /process\.env\./i,
      /['"]example['"]|['"]test['"]|['"]demo['"]/i,
      /['"]YOUR_|['"]REPLACE_|['"]INSERT_/i,
      /\.example/i,
      /\.sample/i
    ];

    return falsePositives.some(pattern => pattern.test(matchText));
  }

  /**
   * Get line number from index
   *
   * @param {string} code - Full code
   * @param {number} index - Character index
   * @returns {number} Line number
   */
  getLineNumber(code, index) {
    const beforeMatch = code.substring(0, index);
    return beforeMatch.split('\n').length;
  }

  /**
   * Get code snippet around position
   *
   * @param {string} code - Full code
   * @param {number} index - Position
   * @param {number} contextLines - Lines of context
   * @returns {string} Code snippet
   */
  getSnippet(code, index, contextLines = 2) {
    const lines = code.split('\n');
    const lineNumber = this.getLineNumber(code, index);
    const startLine = Math.max(0, lineNumber - contextLines - 1);
    const endLine = Math.min(lines.length, lineNumber + contextLines);

    return lines.slice(startLine, endLine).join('\n');
  }

  /**
   * Generate security report
   *
   * @returns {string} Markdown report
   */
  generateReport() {
    if (this.findings.length === 0) {
      return '✅ No security vulnerabilities detected';
    }

    let report = '# Security Validation Report\n\n';
    report += `**Total Vulnerabilities:** ${this.findings.length}\n\n`;

    const bySeverity = {
      critical: this.findings.filter(f => f.severity === 'critical'),
      high: this.findings.filter(f => f.severity === 'high'),
      medium: this.findings.filter(f => f.severity === 'medium')
    };

    for (const [severity, findings] of Object.entries(bySeverity)) {
      if (findings.length === 0) continue;

      report += `## ${severity.toUpperCase()} (${findings.length})\n\n`;

      for (const finding of findings) {
        report += `### ${finding.name}\n`;
        report += `- **File:** ${finding.file}\n`;
        report += `- **Line:** ${finding.line}\n`;
        report += `- **Message:** ${finding.message}\n`;
        report += `- **Type:** ${finding.type}\n`;
        report += '\n**Snippet:**\n```\n';
        report += finding.snippet;
        report += '\n```\n\n';
      }
    }

    return report;
  }
}

export default SecurityValidator;
