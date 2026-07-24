import { SpecialistAgent } from './base.js';
import { executeDeployPhase } from '../phases/deploy.js';
import { readFileSafe } from '../../utils/filesystem.js';
import logger from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Review Specialist
 *
 * Handles code review and compliance checking:
 * - CLAUDE.md compliance verification
 * - Error handling validation
 * - Documentation completeness
 * - Code quality checks
 *
 * Based on Claude Code's review specialist implementation
 */
export class ReviewSpecialist extends SpecialistAgent {
  constructor() {
    super(
      'review',
      ['review', 'check', 'validate', 'compliance', 'quality', 'audit'],
      'Handles code review, compliance checking, and quality validation'
    );
  }

  /**
   * Execute review task
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(task, context) {
    try {
      const taskStr = typeof task === 'string' ? task : task.description || '';
      this.log('Executing review task', { task: taskStr });

      // Route to appropriate handler
      if (taskStr.toLowerCase().includes('compliance') ||
          taskStr.toLowerCase().includes('claude.md')) {
        return await this.checkCompliance(task, context);
      } else if (taskStr.toLowerCase().includes('error handling')) {
        return await this.checkErrorHandling(task, context);
      } else if (taskStr.toLowerCase().includes('documentation')) {
        return await this.checkDocumentation(task, context);
      } else {
        // Default to full review
        return await this.performFullReview(task, context);
      }
    } catch (error) {
      this.logError('Review task failed', error, { task });
      return this.failure(error.message, { task });
    }
  }

  /**
   * Perform full code review
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Review result
   */
  async performFullReview(task, context) {
    try {
      this.log('Performing full code review');

      const review = {
        compliance: { passed: false, issues: [] },
        errorHandling: { passed: false, issues: [] },
        documentation: { passed: false, issues: [] },
        quality: { passed: false, issues: [] },
        overall: { passed: false, score: 0 }
      };

      // Check CLAUDE.md compliance
      const complianceResult = await this.checkCompliance(task, context);
      review.compliance = complianceResult.data || review.compliance;

      // Check error handling
      const errorHandlingResult = await this.checkErrorHandling(task, context);
      review.errorHandling = errorHandlingResult.data || review.errorHandling;

      // Check documentation
      const docResult = await this.checkDocumentation(task, context);
      review.documentation = docResult.data || review.documentation;

      // Check code quality
      const qualityResult = await this.checkCodeQuality(task, context);
      review.quality = qualityResult.data || review.quality;

      // Calculate overall score
      const passedChecks = [
        review.compliance.passed,
        review.errorHandling.passed,
        review.documentation.passed,
        review.quality.passed
      ].filter(p => p).length;

      review.overall.score = (passedChecks / 4) * 100;
      review.overall.passed = review.overall.score >= 75;

      return this.success(
        review,
        `Code review completed (score: ${review.overall.score}%)`
      );
    } catch (error) {
      this.logError('Failed to perform full review', error);
      return this.failure(error.message);
    }
  }

  /**
   * Check CLAUDE.md compliance
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Compliance check result
   */
  async checkCompliance(task, context) {
    try {
      this.log('Checking CLAUDE.md compliance');

      const issues = [];
      const { filesModified = [], workingDir = process.cwd() } = context;

      // Check if CLAUDE.md exists
      const claudeMdPath = path.join(workingDir, 'CLAUDE.md');
      if (!fs.existsSync(claudeMdPath)) {
        issues.push('CLAUDE.md file not found');
        return this.success(
          { passed: false, issues },
          'CLAUDE.md compliance check failed'
        );
      }

      // Read CLAUDE.md to get coding standards
      const claudeMd = await fs.promises.readFile(claudeMdPath, 'utf-8');

      // Check each modified file
      for (const filepath of filesModified) {
        if (!fs.existsSync(filepath)) continue;

        const content = await fs.promises.readFile(filepath, 'utf-8');

        // Check for console.log (should use logger)
        if (content.includes('console.log')) {
          issues.push(`${filepath}: Contains console.log - should use logger`);
        }

        // Check for async without try-catch
        const asyncRegex = /async\s+function|async\s+\(/g;
        if (asyncRegex.test(content) && !content.includes('try') && !content.includes('catch')) {
          issues.push(`${filepath}: Async function without try-catch`);
        }

        // Check for missing JSDoc
        const exportRegex = /export\s+(async\s+)?function\s+\w+/g;
        const matches = content.match(exportRegex) || [];
        const jsdocRegex = /\/\*\*[\s\S]*?\*\//g;
        const jsdocCount = (content.match(jsdocRegex) || []).length;

        if (matches.length > jsdocCount) {
          issues.push(`${filepath}: Missing JSDoc comments for exported functions`);
        }
      }

      // Use existing deploy phase for deeper compliance check
      if (context.budgetManager) {
        const deployResult = await executeDeployPhase(
          { filesModified },
          context.budgetManager
        );

        if (!deployResult.success && deployResult.complianceIssues) {
          issues.push(...deployResult.complianceIssues);
        }
      }

      return this.success(
        {
          passed: issues.length === 0,
          issues,
          filesChecked: filesModified.length
        },
        issues.length === 0
          ? 'CLAUDE.md compliance check passed'
          : `Found ${issues.length} compliance issues`
      );
    } catch (error) {
      this.logError('Failed to check compliance', error);
      return this.failure(error.message);
    }
  }

  /**
   * Check error handling
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Error handling check result
   */
  async checkErrorHandling(task, context) {
    try {
      this.log('Checking error handling');

      const issues = [];
      const { filesModified = [] } = context;

      for (const filepath of filesModified) {
        if (!fs.existsSync(filepath)) continue;

        const content = await fs.promises.readFile(filepath, 'utf-8');

        // Check for uncaught promises
        if (content.includes('await ') && !content.includes('try') && !content.includes('catch')) {
          issues.push(`${filepath}: Await without try-catch`);
        }

        // Check for .then() without .catch()
        const thenRegex = /\.then\(/g;
        const catchRegex = /\.catch\(/g;
        const thenCount = (content.match(thenRegex) || []).length;
        const catchCount = (content.match(catchRegex) || []).length;

        if (thenCount > catchCount) {
          issues.push(`${filepath}: .then() without corresponding .catch()`);
        }

        // Check for error logging
        const errorHandlers = content.match(/catch\s*\(\s*(\w+)\s*\)/g) || [];
        for (const handler of errorHandlers) {
          const errorVar = handler.match(/\w+/g)[1];
          if (!content.includes(`logger.error`) && !content.includes(`console.error`)) {
            issues.push(`${filepath}: Caught error not logged`);
            break;
          }
        }
      }

      return this.success(
        {
          passed: issues.length === 0,
          issues,
          filesChecked: filesModified.length
        },
        issues.length === 0
          ? 'Error handling check passed'
          : `Found ${issues.length} error handling issues`
      );
    } catch (error) {
      this.logError('Failed to check error handling', error);
      return this.failure(error.message);
    }
  }

  /**
   * Check documentation
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Documentation check result
   */
  async checkDocumentation(task, context) {
    try {
      this.log('Checking documentation');

      const issues = [];
      const { filesModified = [] } = context;

      for (const filepath of filesModified) {
        if (!fs.existsSync(filepath)) continue;
        if (!filepath.endsWith('.js') && !filepath.endsWith('.ts')) continue;

        const content = await fs.promises.readFile(filepath, 'utf-8');

        // Check for exported functions without JSDoc
        const exportRegex = /export\s+(async\s+)?function\s+(\w+)/g;
        let match;
        while ((match = exportRegex.exec(content)) !== null) {
          const functionName = match[2];
          const beforeFunction = content.substring(0, match.index);
          const lastJsDoc = beforeFunction.lastIndexOf('/**');
          const lastNewline = beforeFunction.lastIndexOf('\n');

          if (lastJsDoc < lastNewline) {
            issues.push(`${filepath}: Function '${functionName}' missing JSDoc`);
          }
        }

        // Check for exported classes without JSDoc
        const classRegex = /export\s+class\s+(\w+)/g;
        while ((match = classRegex.exec(content)) !== null) {
          const className = match[1];
          const beforeClass = content.substring(0, match.index);
          const lastJsDoc = beforeClass.lastIndexOf('/**');
          const lastNewline = beforeClass.lastIndexOf('\n');

          if (lastJsDoc < lastNewline) {
            issues.push(`${filepath}: Class '${className}' missing JSDoc`);
          }
        }
      }

      return this.success(
        {
          passed: issues.length === 0,
          issues,
          filesChecked: filesModified.length
        },
        issues.length === 0
          ? 'Documentation check passed'
          : `Found ${issues.length} documentation issues`
      );
    } catch (error) {
      this.logError('Failed to check documentation', error);
      return this.failure(error.message);
    }
  }

  /**
   * Check code quality
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Code quality check result
   */
  async checkCodeQuality(task, context) {
    try {
      this.log('Checking code quality');

      const issues = [];
      const { filesModified = [] } = context;

      for (const filepath of filesModified) {
        if (!fs.existsSync(filepath)) continue;

        const content = await fs.promises.readFile(filepath, 'utf-8');

        // Check for very long functions (> 100 lines)
        const functions = content.match(/function\s+\w+[\s\S]*?(?=\n\s*(?:function|\}|export|$))/g) || [];
        for (const func of functions) {
          const lines = func.split('\n').length;
          if (lines > 100) {
            issues.push(`${filepath}: Function longer than 100 lines (${lines})`);
          }
        }

        // Check for magic numbers
        const numberRegex = /(?<![a-zA-Z0-9_])(\d{2,})(?![a-zA-Z0-9_])/g;
        const numbers = content.match(numberRegex) || [];
        if (numbers.length > 5) {
          issues.push(`${filepath}: Contains multiple magic numbers, consider using constants`);
        }

        // Check for nested callbacks (callback hell)
        const nestedCallbackRegex = /function\s*\([^)]*\)\s*\{[\s\S]*?function\s*\([^)]*\)\s*\{[\s\S]*?function\s*\([^)]*\)\s*\{/;
        if (nestedCallbackRegex.test(content)) {
          issues.push(`${filepath}: Deeply nested callbacks detected, consider using async/await`);
        }
      }

      return this.success(
        {
          passed: issues.length === 0,
          issues,
          filesChecked: filesModified.length
        },
        issues.length === 0
          ? 'Code quality check passed'
          : `Found ${issues.length} code quality issues`
      );
    } catch (error) {
      this.logError('Failed to check code quality', error);
      return this.failure(error.message);
    }
  }
}
