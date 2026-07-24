/**
 * Compliance Validator - Pass 3 of Quad-Pass Validation
 *
 * Wraps existing compliance.js to provide standardized interface
 * for quad-pass validation pipeline.
 *
 * Validates code against CLAUDE.md coding principles:
 * - Module system (ES6 vs CommonJS)
 * - Error handling patterns
 * - Logging requirements
 * - Documentation standards
 * - Security requirements
 *
 * @module compliance-validator
 */

import { validateCompliance } from '../compliance.js';
import logger from '../../utils/logger.js';

/**
 * Compliance Validator - Pass 3
 */
export class ComplianceValidator {
  constructor(budgetManager = null) {
    this.budgetManager = budgetManager;
  }

  /**
   * Validate file for CLAUDE.md compliance
   *
   * @param {string} filePath - Path to file
   * @param {string} code - Code to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateFile(filePath, code) {
    logger.debug('Running compliance validation', { filePath });

    try {
      const result = await validateCompliance(code, filePath, this.budgetManager);

      if (!result.compliant) {
        logger.warn('Compliance violations found', {
          filePath,
          violations: result.violations.length,
          warnings: result.warnings.length
        });
      } else {
        logger.info('Compliance validation passed', { filePath });
      }

      return {
        valid: result.compliant,
        violations: result.violations,
        warnings: result.warnings,
        summary: {
          total: result.violations.length + result.warnings.length,
          violations: result.violations.length,
          warnings: result.warnings.length
        }
      };
    } catch (error) {
      logger.error('Compliance validation failed', {
        filePath,
        error: error.message
      });

      return {
        valid: false,
        violations: [`Validation error: ${error.message}`],
        warnings: [],
        summary: {
          total: 1,
          violations: 1,
          warnings: 0
        }
      };
    }
  }

  /**
   * Validate multiple files
   *
   * @param {Array<Object>} files - Array of {path, code} objects
   * @returns {Promise<Object>} Aggregated validation result
   */
  async validateFiles(files) {
    const results = [];
    let allValid = true;

    for (const file of files) {
      const result = await this.validateFile(file.path, file.code);
      results.push({
        file: file.path,
        ...result
      });

      if (!result.valid) {
        allValid = false;
      }
    }

    const totalViolations = results.reduce(
      (sum, r) => sum + r.violations.length,
      0
    );
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

    return {
      valid: allValid,
      results,
      summary: {
        filesChecked: files.length,
        totalViolations,
        totalWarnings,
        filesWithViolations: results.filter(r => r.violations.length > 0).length
      }
    };
  }

  /**
   * Generate compliance report
   *
   * @param {Object} result - Validation result
   * @returns {string} Markdown report
   */
  generateReport(result) {
    if (result.valid) {
      return '✅ All files compliant with CLAUDE.md standards';
    }

    let report = '# CLAUDE.md Compliance Report\n\n';
    report += `**Files Checked:** ${result.summary.filesChecked}\n`;
    report += `**Total Violations:** ${result.summary.totalViolations}\n`;
    report += `**Total Warnings:** ${result.summary.totalWarnings}\n\n`;

    for (const fileResult of result.results) {
      if (fileResult.violations.length === 0 && fileResult.warnings.length === 0) {
        continue;
      }

      report += `## ${fileResult.file}\n\n`;

      if (fileResult.violations.length > 0) {
        report += '### Violations\n\n';
        for (const violation of fileResult.violations) {
          report += `- ${violation}\n`;
        }
        report += '\n';
      }

      if (fileResult.warnings.length > 0) {
        report += '### Warnings\n\n';
        for (const warning of fileResult.warnings) {
          report += `- ${warning}\n`;
        }
        report += '\n';
      }
    }

    return report;
  }
}

export default ComplianceValidator;
