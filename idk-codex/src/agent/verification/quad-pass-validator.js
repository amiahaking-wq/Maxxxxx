/**
 * Quad-Pass Verification Pipeline
 *
 * Enhanced from dual-pass to quad-pass validation:
 * - PASS 1: Syntax Check (fast, catches parse errors)
 * - PASS 2: Runtime Test (slow, catches logical errors)
 * - PASS 3: Compliance Validator (CLAUDE.md standards)
 * - PASS 4: Security Validator (vulnerability detection)
 *
 * Features:
 * - Multi-language syntax validation (JS, TS, Python, JSON)
 * - Runtime test execution
 * - CLAUDE.md compliance checking
 * - Security vulnerability scanning
 * - Self-healing auto-correction (max 5 retries)
 * - AI-powered error fixes
 * - Learning from successful corrections
 *
 * Based on Claude Code's quad-pass validation system.
 *
 * @module quad-pass-validator
 */

import { DualPassValidator } from './dual-pass-validator.js';
import { ComplianceValidator } from './compliance-validator.js';
import { SecurityValidator } from './security-validator.js';
import logger from '../../utils/logger.js';

export class QuadPassValidator extends DualPassValidator {
  constructor(llmAdapter, budgetManager = null) {
    super(llmAdapter);
    this.budgetManager = budgetManager;
    this.complianceValidator = new ComplianceValidator(budgetManager);
    this.securityValidator = new SecurityValidator();
  }

  /**
   * PASS 3: Compliance Check (CLAUDE.md standards)
   *
   * Validates code against project coding principles.
   *
   * @param {string} filePath - Path to file
   * @param {string} modifiedCode - Code to validate
   * @returns {Promise<Object>} Validation result
   */
  async pass3ComplianceCheck(filePath, modifiedCode) {
    logger.debug('Running Pass 3: Compliance Check', { filePath });

    try {
      const result = await this.complianceValidator.validateFile(filePath, modifiedCode);

      if (!result.valid) {
        logger.warn('Pass 3: Compliance check FAILED', {
          filePath,
          violations: result.violations.length,
          warnings: result.warnings.length
        });

        return {
          valid: false,
          violations: result.violations,
          warnings: result.warnings,
          phase: 'PASS_3_COMPLIANCE',
          suggestion: 'Review CLAUDE.md and fix violations'
        };
      }

      logger.info('Pass 3: Compliance check PASSED', { filePath });

      return {
        valid: true,
        warnings: result.warnings
      };

    } catch (error) {
      logger.error('Pass 3: Compliance check ERROR', {
        filePath,
        error: error.message
      });

      return {
        valid: false,
        error: error.message,
        phase: 'PASS_3_COMPLIANCE'
      };
    }
  }

  /**
   * PASS 4: Security Check (vulnerability detection)
   *
   * Scans for security vulnerabilities in code.
   *
   * @param {string} filePath - Path to file
   * @param {string} modifiedCode - Code to validate
   * @returns {Promise<Object>} Validation result
   */
  async pass4SecurityCheck(filePath, modifiedCode) {
    logger.debug('Running Pass 4: Security Check', { filePath });

    try {
      const result = await this.securityValidator.validateFile(filePath, modifiedCode);

      if (!result.valid) {
        logger.warn('Pass 4: Security check FAILED', {
          filePath,
          vulnerabilities: result.vulnerabilities.length,
          critical: result.summary.critical
        });

        return {
          valid: false,
          vulnerabilities: result.vulnerabilities,
          summary: result.summary,
          phase: 'PASS_4_SECURITY',
          suggestion: 'Fix security vulnerabilities before deployment',
          report: this.securityValidator.generateReport()
        };
      }

      if (result.vulnerabilities.length > 0) {
        logger.info('Pass 4: Security check PASSED with warnings', {
          filePath,
          nonCritical: result.vulnerabilities.length
        });
      } else {
        logger.info('Pass 4: Security check PASSED', { filePath });
      }

      return {
        valid: true,
        vulnerabilities: result.vulnerabilities,
        summary: result.summary
      };

    } catch (error) {
      logger.error('Pass 4: Security check ERROR', {
        filePath,
        error: error.message
      });

      return {
        valid: false,
        error: error.message,
        phase: 'PASS_4_SECURITY'
      };
    }
  }

  /**
   * Run all 4 passes on a file
   *
   * @param {string} filePath - File path
   * @param {string} modifiedCode - Code to validate
   * @returns {Promise<Object>} Combined validation result
   */
  async validateAllPasses(filePath, modifiedCode) {
    const results = {
      pass1: null,
      pass2: null,
      pass3: null,
      pass4: null,
      allPassed: false
    };

    // PASS 1: Syntax Check
    results.pass1 = await this.pass1SyntaxCheck(filePath, modifiedCode);
    if (!results.pass1.valid) {
      return { ...results, failedAtPass: 1 };
    }

    // PASS 2: Runtime Test
    results.pass2 = await this.pass2RuntimeTest(filePath, modifiedCode);
    if (!results.pass2.valid && !results.pass2.skipped) {
      return { ...results, failedAtPass: 2 };
    }

    // PASS 3: Compliance Check
    results.pass3 = await this.pass3ComplianceCheck(filePath, modifiedCode);
    if (!results.pass3.valid) {
      return { ...results, failedAtPass: 3 };
    }

    // PASS 4: Security Check
    results.pass4 = await this.pass4SecurityCheck(filePath, modifiedCode);
    if (!results.pass4.valid) {
      return { ...results, failedAtPass: 4 };
    }

    results.allPassed = true;
    return results;
  }

  /**
   * Self-healing validation loop with max 5 retries (quad-pass enhanced)
   *
   * @param {string} filePath - File path
   * @param {string} modifiedCode - Code to validate
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<Object>} Final validation result
   */
  async validateWithSelfHealing(filePath, modifiedCode, maxRetries = 5) {
    let currentCode = modifiedCode;
    const attempts = [];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      logger.info(`Quad-pass validation attempt ${attempt + 1}/${maxRetries}`, { filePath });

      // Run all 4 passes
      const result = await this.validateAllPasses(filePath, currentCode);

      if (result.allPassed) {
        logger.info(`Validation succeeded on attempt ${attempt + 1}`, { filePath });

        return {
          valid: true,
          code: currentCode,
          attempts: attempt + 1,
          history: attempts,
          results: result
        };
      }

      // Log failure
      const failedPass = result.failedAtPass;
      const failedPassName = ['Syntax', 'Runtime', 'Compliance', 'Security'][failedPass - 1];

      logger.warn(`Pass ${failedPass} (${failedPassName}) failed (attempt ${attempt + 1})`, {
        filePath
      });

      attempts.push({
        attempt: attempt + 1,
        failedPass,
        failedPassName,
        error: result[`pass${failedPass}`].error || 'Validation failed'
      });

      // Auto-correct based on failed pass
      try {
        if (failedPass === 1) {
          // Syntax error
          currentCode = await this.autoCorrectSyntax(
            currentCode,
            result.pass1.error,
            filePath
          );
        } else if (failedPass === 2) {
          // Runtime error
          currentCode = await this.autoCorrectRuntime(
            currentCode,
            result.pass2.error,
            filePath
          );
        } else if (failedPass === 3) {
          // Compliance violation
          currentCode = await this.autoCorrectCompliance(
            currentCode,
            result.pass3.violations,
            filePath
          );
        } else if (failedPass === 4) {
          // Security vulnerability
          currentCode = await this.autoCorrectSecurity(
            currentCode,
            result.pass4.vulnerabilities,
            filePath
          );
        }
      } catch (error) {
        logger.error('Auto-correction failed', {
          filePath,
          attempt: attempt + 1,
          error: error.message
        });
        // Continue with original code on correction failure
      }
    }

    // Failed after all retries
    logger.error(`Validation failed after ${maxRetries} retries`, { filePath });

    return {
      valid: false,
      code: currentCode,
      attempts: maxRetries,
      history: attempts,
      error: 'Max retries exceeded'
    };
  }

  /**
   * Auto-correct compliance violations using AI
   *
   * @param {string} code - Code with violations
   * @param {Array<string>} violations - Violation messages
   * @param {string} filePath - File path for context
   * @returns {Promise<string>} Corrected code
   */
  async autoCorrectCompliance(code, violations, filePath) {
    logger.info('Attempting auto-correction for compliance violations');

    const prompt = `Fix CLAUDE.md compliance violations:

File: ${filePath}
Violations:
${violations.map((v, i) => `${i + 1}. ${v}`).join('\n')}

Code:
\`\`\`
${code}
\`\`\`

Fix the violations while maintaining functionality.
Return ONLY the corrected code, no explanation or markdown.`;

    try {
      const response = await this.llmAdapter.createCompletion({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        maxTokens: 4000,
        taskType: 'validation',
        budgetManager: this.budgetManager
      });

      const correctedCode = this.extractCode(response.content);

      logger.info('Compliance auto-correction completed', {
        originalLength: code.length,
        correctedLength: correctedCode.length
      });

      return correctedCode;

    } catch (error) {
      logger.error('Compliance auto-correction failed', { error: error.message });
      return code; // Return original if correction fails
    }
  }

  /**
   * Auto-correct security vulnerabilities using AI
   *
   * @param {string} code - Code with vulnerabilities
   * @param {Array<Object>} vulnerabilities - Vulnerability details
   * @param {string} filePath - File path for context
   * @returns {Promise<string>} Corrected code
   */
  async autoCorrectSecurity(code, vulnerabilities, filePath) {
    logger.info('Attempting auto-correction for security vulnerabilities');

    const vulnList = vulnerabilities
      .map((v, i) => `${i + 1}. [${v.severity.toUpperCase()}] ${v.message} (Line ${v.line})`)
      .join('\n');

    const prompt = `Fix security vulnerabilities:

File: ${filePath}
Vulnerabilities:
${vulnList}

Code:
\`\`\`
${code}
\`\`\`

Fix the security issues while maintaining functionality.
Use environment variables for secrets, parameterized queries for SQL, etc.
Return ONLY the corrected code, no explanation or markdown.`;

    try {
      const response = await this.llmAdapter.createCompletion({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        maxTokens: 4000,
        taskType: 'validation',
        budgetManager: this.budgetManager
      });

      const correctedCode = this.extractCode(response.content);

      logger.info('Security auto-correction completed', {
        originalLength: code.length,
        correctedLength: correctedCode.length
      });

      return correctedCode;

    } catch (error) {
      logger.error('Security auto-correction failed', { error: error.message });
      return code;
    }
  }

  /**
   * Validate multiple files with quad-pass
   *
   * @param {Array<Object>} files - Array of {path, code} objects
   * @param {boolean} selfHeal - Enable self-healing
   * @returns {Promise<Object>} Aggregated validation result
   */
  async validateFiles(files, selfHeal = false) {
    const results = [];
    let allPassed = true;

    for (const file of files) {
      let result;

      if (selfHeal) {
        result = await this.validateWithSelfHealing(file.path, file.code);
      } else {
        result = await this.validateAllPasses(file.path, file.code);
        result.valid = result.allPassed;
      }

      results.push({
        file: file.path,
        ...result
      });

      if (!result.valid) {
        allPassed = false;
      }
    }

    return {
      valid: allPassed,
      results,
      summary: {
        filesChecked: files.length,
        filesPassed: results.filter(r => r.valid).length,
        filesFailed: results.filter(r => !r.valid).length
      }
    };
  }

  /**
   * Generate comprehensive validation report
   *
   * @param {Object} result - Validation result
   * @returns {string} Markdown report
   */
  generateReport(result) {
    if (result.valid) {
      return '✅ All files passed quad-pass validation';
    }

    let report = '# Quad-Pass Validation Report\n\n';
    report += `**Files Checked:** ${result.summary.filesChecked}\n`;
    report += `**Files Passed:** ${result.summary.filesPassed}\n`;
    report += `**Files Failed:** ${result.summary.filesFailed}\n\n`;

    for (const fileResult of result.results) {
      if (fileResult.valid) {
        report += `## ✅ ${fileResult.file}\n\n`;
        report += 'All passes completed successfully.\n\n';
        continue;
      }

      report += `## ❌ ${fileResult.file}\n\n`;
      report += `**Failed at Pass ${fileResult.failedAtPass}**\n\n`;

      if (fileResult.pass1 && !fileResult.pass1.valid) {
        report += '### Pass 1: Syntax Check\n';
        report += `- Error: ${fileResult.pass1.error}\n\n`;
      }

      if (fileResult.pass2 && !fileResult.pass2.valid) {
        report += '### Pass 2: Runtime Test\n';
        report += `- Error: ${fileResult.pass2.error}\n\n`;
      }

      if (fileResult.pass3 && !fileResult.pass3.valid) {
        report += '### Pass 3: Compliance Check\n';
        report += '**Violations:**\n';
        for (const violation of fileResult.pass3.violations) {
          report += `- ${violation}\n`;
        }
        report += '\n';
      }

      if (fileResult.pass4 && !fileResult.pass4.valid) {
        report += '### Pass 4: Security Check\n';
        report += fileResult.pass4.report || 'Security vulnerabilities detected';
        report += '\n';
      }
    }

    return report;
  }
}

export default QuadPassValidator;
