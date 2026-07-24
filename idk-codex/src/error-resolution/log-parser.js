/**
 * Log Parser with Regex Error Detection
 * Replicates the automated bug-hunting behavior from image_3.png
 */

import logger from '../utils/logger.js';

export class LogParser {
  constructor() {
    // Error patterns organized by category
    this.errorPatterns = {
      // Syntax Errors
      syntax: [
        {
          pattern: /SyntaxError: (.*?)(?:\n|$)/i,
          severity: 'high',
          category: 'syntax',
          extract: (match) => ({
            type: 'SyntaxError',
            message: match[1],
            file: this.extractFileFromStack(match.input)
          })
        },
        {
          pattern: /Unexpected token (.*?) in JSON/i,
          severity: 'high',
          category: 'syntax',
          extract: (match) => ({
            type: 'JSON Parse Error',
            message: `Unexpected token ${match[1]}`,
            file: null
          })
        }
      ],

      // Module/Import Errors
      module: [
        {
          pattern: /Cannot find module ['"]([^'"]+)['"]/i,
          severity: 'high',
          category: 'module',
          extract: (match) => ({
            type: 'Missing Module',
            message: `Cannot find module '${match[1]}'`,
            missingModule: match[1],
            suggestion: `Run: npm install ${match[1]}`
          })
        },
        {
          pattern: /Module not found: Error: Can't resolve ['"]([^'"]+)['"]/i,
          severity: 'high',
          category: 'module',
          extract: (match) => ({
            type: 'Webpack Module Not Found',
            message: `Can't resolve '${match[1]}'`,
            missingModule: match[1]
          })
        },
        {
          pattern: /ERR_MODULE_NOT_FOUND/i,
          severity: 'high',
          category: 'module',
          extract: (match) => ({
            type: 'ES Module Not Found',
            message: match[0],
            file: this.extractFileFromStack(match.input)
          })
        }
      ],

      // Type Errors
      type: [
        {
          pattern: /TypeError: (.*?)(?:\n|$)/i,
          severity: 'high',
          category: 'type',
          extract: (match) => ({
            type: 'TypeError',
            message: match[1],
            file: this.extractFileFromStack(match.input)
          })
        },
        {
          pattern: /Cannot read propert(?:y|ies) ['"]?(\w+)['"]? of (undefined|null)/i,
          severity: 'high',
          category: 'type',
          extract: (match) => ({
            type: 'Null Reference Error',
            message: `Cannot read property '${match[1]}' of ${match[2]}`,
            property: match[1],
            suggestion: 'Add null check or optional chaining'
          })
        }
      ],

      // Reference Errors
      reference: [
        {
          pattern: /ReferenceError: (.*?)(?:\n|$)/i,
          severity: 'high',
          category: 'reference',
          extract: (match) => ({
            type: 'ReferenceError',
            message: match[1],
            file: this.extractFileFromStack(match.input)
          })
        },
        {
          pattern: /(\w+) is not defined/i,
          severity: 'high',
          category: 'reference',
          extract: (match) => ({
            type: 'Undefined Variable',
            message: `${match[1]} is not defined`,
            variable: match[1],
            suggestion: `Check if '${match[1]}' is imported or declared`
          })
        }
      ],

      // Build/Compilation Errors
      build: [
        {
          pattern: /Error: Build failed with (\d+) errors?/i,
          severity: 'high',
          category: 'build',
          extract: (match) => ({
            type: 'Build Failed',
            message: `Build failed with ${match[1]} error(s)`,
            errorCount: parseInt(match[1])
          })
        },
        {
          pattern: /ELIFECYCLE/i,
          severity: 'high',
          category: 'build',
          extract: (match) => ({
            type: 'NPM Lifecycle Error',
            message: 'NPM script failed to execute',
            suggestion: 'Check npm script configuration in package.json'
          })
        }
      ],

      // Test Failures
      test: [
        {
          pattern: /FAIL (.*?)\.test\.(js|ts|jsx|tsx)/i,
          severity: 'medium',
          category: 'test',
          extract: (match) => ({
            type: 'Test Failed',
            message: `Test failed: ${match[1]}`,
            testFile: match[0]
          })
        },
        {
          pattern: /Expected.*?but got.*?/i,
          severity: 'medium',
          category: 'test',
          extract: (match) => ({
            type: 'Assertion Failed',
            message: match[0]
          })
        }
      ],

      // System/Dependencies
      system: [
        {
          pattern: /gyp ERR!/i,
          severity: 'high',
          category: 'system',
          extract: (match) => ({
            type: 'Native Build Error',
            message: 'Failed to build native dependency',
            suggestion: 'Install build tools: python3, make, g++'
          })
        },
        {
          pattern: /command not found: (\w+)/i,
          severity: 'high',
          category: 'system',
          extract: (match) => ({
            type: 'Command Not Found',
            message: `Command not found: ${match[1]}`,
            missingCommand: match[1],
            suggestion: `Install ${match[1]} or check PATH`
          })
        }
      ],

      // Runtime Errors
      runtime: [
        {
          pattern: /EADDRINUSE.*?:(\d+)/i,
          severity: 'high',
          category: 'runtime',
          extract: (match) => ({
            type: 'Port Already In Use',
            message: `Port ${match[1]} is already in use`,
            port: match[1],
            suggestion: `Kill process on port ${match[1]} or use different port`
          })
        },
        {
          pattern: /ECONNREFUSED (.*?):(\d+)/i,
          severity: 'high',
          category: 'runtime',
          extract: (match) => ({
            type: 'Connection Refused',
            message: `Connection refused to ${match[1]}:${match[2]}`,
            host: match[1],
            port: match[2]
          })
        }
      ]
    };
  }

  /**
   * Parse error log and extract structured error information
   */
  parseLog(logText) {
    if (!logText || typeof logText !== 'string') {
      return null;
    }

    logger.debug('Parsing error log', { length: logText.length });

    const errors = [];

    // Try each category of error patterns
    for (const [category, patterns] of Object.entries(this.errorPatterns)) {
      for (const errorDef of patterns) {
        const matches = logText.matchAll(new RegExp(errorDef.pattern, 'gi'));

        for (const match of matches) {
          try {
            const errorInfo = errorDef.extract(match);
            errors.push({
              ...errorInfo,
              category,
              severity: errorDef.severity,
              rawMatch: match[0],
              context: this.extractContext(logText, match.index)
            });
          } catch (error) {
            logger.warn('Failed to extract error info', { error: error.message });
          }
        }
      }
    }

    if (errors.length === 0) {
      logger.debug('No structured errors found in log');
      return null;
    }

    // Sort by severity
    errors.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    logger.info('Parsed errors from log', {
      errorCount: errors.length,
      categories: [...new Set(errors.map(e => e.category))]
    });

    return {
      errors,
      primaryError: errors[0],
      errorCount: errors.length,
      categories: [...new Set(errors.map(e => e.category))]
    };
  }

  /**
   * Extract file path from stack trace
   */
  extractFileFromStack(stackTrace) {
    const fileMatch = stackTrace.match(/at .*?\(([^)]+):(\d+):(\d+)\)/);
    if (fileMatch) {
      return {
        path: fileMatch[1],
        line: parseInt(fileMatch[2]),
        column: parseInt(fileMatch[3])
      };
    }

    const simpleMatch = stackTrace.match(/([^:]+):(\d+):(\d+)/);
    if (simpleMatch) {
      return {
        path: simpleMatch[1],
        line: parseInt(simpleMatch[2]),
        column: parseInt(simpleMatch[3])
      };
    }

    return null;
  }

  /**
   * Extract context around error (5 lines before/after)
   */
  extractContext(logText, errorIndex, linesBefore = 3, linesAfter = 3) {
    const lines = logText.split('\n');
    const errorLineIndex = logText.substring(0, errorIndex).split('\n').length - 1;

    const startLine = Math.max(0, errorLineIndex - linesBefore);
    const endLine = Math.min(lines.length, errorLineIndex + linesAfter + 1);

    return {
      lines: lines.slice(startLine, endLine),
      errorLineIndex: errorLineIndex - startLine
    };
  }

  /**
   * Check if log contains any errors
   */
  hasErrors(logText) {
    if (!logText) return false;

    const commonErrorIndicators = [
      /error:/i,
      /exception:/i,
      /failed/i,
      /errno/i,
      /\[ERR\]/i
    ];

    return commonErrorIndicators.some(pattern => pattern.test(logText));
  }
}

export default LogParser;
