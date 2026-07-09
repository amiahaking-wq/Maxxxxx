/**
 * Cognitive Reflection Loop
 * Purpose: Implements the complete cognitive reflection pipeline
 *
 * Flow:
 * 1. User Prompt → Pushback Engine (clarify if vague)
 * 2. Implementation → Auto-Validation (test-driven)
 * 3. Success → Architecture Documentation
 */

import { PushbackEngine } from './pushback-engine.js';
import { AutoValidator } from '../validation/auto-validator.js';
import { ArchitectureWriter } from '../documentation/arch-writer.js';
import logger from '../../utils/logger.js';

/**
 * Implements the complete cognitive reflection pipeline
 */
export class CognitiveReflectionLoop {
  constructor(repoPath = null, budgetManager = null) {
    this.pushback = new PushbackEngine();
    this.validator = new AutoValidator();
    this.archWriter = new ArchitectureWriter(repoPath);
    this.budgetManager = budgetManager;

    // Check if cognitive reflection is enabled
    this.pushbackEnabled = process.env.ENABLE_PUSHBACK_ENGINE !== 'false';
    this.validationEnabled = process.env.ENABLE_AUTO_VALIDATION !== 'false';
    this.archDocEnabled = process.env.ENABLE_ARCH_DOCUMENTATION !== 'false';

    logger.info('Cognitive Reflection Loop initialized', {
      pushbackEnabled: this.pushbackEnabled,
      validationEnabled: this.validationEnabled,
      archDocEnabled: this.archDocEnabled
    });
  }

  /**
   * Full cognitive reflection pipeline
   * @param {string} userPrompt - User's task description
   * @param {Function} implementationFn - Function that performs the implementation
   * @returns {Promise<Object>} Result with success status and details
   */
  async execute(userPrompt, implementationFn) {
    logger.info('Starting cognitive reflection loop', {
      promptLength: userPrompt.length
    });

    try {
      // Step 1: Pushback & Clarification
      if (this.pushbackEnabled) {
        const analysis = await this.pushback.analyzePrompt(userPrompt, this.budgetManager);

        if (analysis.needsClarification) {
          logger.info('Prompt needs clarification, generating menu');

          const menu = await this.pushback.generateClarificationMenu(
            userPrompt,
            analysis.analysis,
            this.budgetManager
          );

          return {
            needsClarification: true,
            clarificationMenu: menu,
            analysis: analysis.analysis
          };
        }

        logger.info('Prompt is clear, proceeding with implementation');
      } else {
        logger.info('Pushback engine disabled, skipping clarification check');
      }

      // Step 2: Implementation (provided by caller)
      logger.info('Executing implementation function');
      const implementation = await implementationFn();

      // Check if implementation was successful
      if (!implementation || !implementation.success) {
        logger.error('Implementation failed', {
          error: implementation?.error || 'Unknown error'
        });
        return {
          success: false,
          error: implementation?.error || 'Implementation failed',
          implementation
        };
      }

      // Step 3: Auto-Validation
      if (this.validationEnabled && implementation.modifiedFiles?.length > 0) {
        logger.info('Validating implementation', {
          fileCount: implementation.modifiedFiles.length
        });

        const validation = await this.validator.validateFiles(
          implementation.modifiedFiles,
          this.budgetManager
        );

        if (!validation.allValid) {
          logger.error('Validation failed', {
            failedFiles: validation.results.filter(r => !r.valid && !r.skipped).length
          });

          return {
            success: false,
            error: 'Validation failed',
            validation,
            implementation
          };
        }

        logger.info('Validation passed', {
          totalFiles: validation.results.length,
          validFiles: validation.results.filter(r => r.valid).length
        });

        implementation.validation = validation;
      } else {
        logger.info('Auto-validation disabled or no files to validate');
      }

      // Step 4: Architecture Documentation
      if (this.archDocEnabled) {
        logger.info('Documenting architecture');

        const docResult = await this.archWriter.documentDecision(
          userPrompt,
          implementation,
          implementation.reasoning || 'Implemented as specified',
          this.budgetManager
        );

        if (!docResult.success) {
          logger.warn('Failed to document architecture', {
            error: docResult.error
          });
          // Non-fatal - continue
        }

        implementation.documented = docResult.success;
        implementation.documentationPath = docResult.filePath;
      } else {
        logger.info('Architecture documentation disabled');
      }

      logger.info('Cognitive reflection loop completed successfully');

      return {
        success: true,
        implementation,
        validation: implementation.validation || null,
        documented: implementation.documented || false
      };
    } catch (error) {
      logger.error('Cognitive reflection loop failed', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Updates budget manager reference
   * @param {Object} budgetManager - Token budget manager
   */
  setBudgetManager(budgetManager) {
    this.budgetManager = budgetManager;
  }
}

export default CognitiveReflectionLoop;
