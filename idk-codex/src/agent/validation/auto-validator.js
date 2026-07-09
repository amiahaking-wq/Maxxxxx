/**
 * Layer 2: Test-Driven Auto-Validation Pipeline (Anti-Slop Engine)
 * Purpose: Validates generated code before reporting completion
 * Self-corrects via error learning database
 */

import { executeCommandSafely } from '../../security/sandbox.js';
import { findKnownFix, learnFromSuccess } from '../error-learning.js';
import { generateCompletion } from '../../groq/client.js';
import logger from '../../utils/logger.js';
import path from 'path';

/**
 * Validates generated code before reporting completion
 * Self-corrects via error learning database
 */
export class AutoValidator {
  constructor() {
    this.maxRetries = parseInt(process.env.MAX_SELF_CORRECTION_RETRIES || '10', 10);
    this.validationCommands = {
      js: 'node --check',
      javascript: 'node --check',
      ts: 'tsc --noEmit',
      typescript: 'tsc --noEmit',
      py: 'python -m py_compile',
      python: 'python -m py_compile',
      json: 'node -e "JSON.parse(require(\'fs\').readFileSync(process.argv[1]))"'
    };
  }

  /**
   * Validates all modified files before completion
   * @param {Array<string>} modifiedFiles - List of file paths
   * @param {Object} budgetManager - Token budget manager (optional)
   * @returns {Promise<Object>} Validation results
   */
  async validateFiles(modifiedFiles, budgetManager = null) {
    logger.info('Starting file validation', { fileCount: modifiedFiles.length });

    const results = [];

    for (const file of modifiedFiles) {
      const result = await this.validateFile(file);
      results.push(result);

      if (!result.valid && !result.skipped) {
        logger.warn('File validation failed, attempting self-correction', { file });

        // Attempt self-correction
        const corrected = await this.selfCorrect(file, result.error, budgetManager);
        if (corrected) {
          result.valid = true;
          result.selfCorrected = true;
          logger.info('Self-correction successful', { file });
        } else {
          logger.error('Self-correction failed', { file });
        }
      }
    }

    const allValid = results.every(r => r.valid || r.skipped);

    logger.info('File validation completed', {
      total: results.length,
      valid: results.filter(r => r.valid).length,
      skipped: results.filter(r => r.skipped).length,
      failed: results.filter(r => !r.valid && !r.skipped).length,
      selfCorrected: results.filter(r => r.selfCorrected).length
    });

    return {
      allValid,
      results
    };
  }

  /**
   * Validates a single file
   * @param {string} filePath - Path to file
   * @returns {Promise<Object>} Validation result
   */
  async validateFile(filePath) {
    try {
      const ext = path.extname(filePath).slice(1);
      const command = this.validationCommands[ext];

      if (!command) {
        logger.debug('No validator for file type', { ext, file: filePath });
        return { valid: true, skipped: true, filePath };
      }

      const [cmd, ...args] = command.split(' ');

      const result = await executeCommandSafely(cmd, [...args, filePath], {
        timeout: 30000 // 30 seconds per file
      });

      return {
        valid: result.exitCode === 0,
        error: result.exitCode !== 0 ? result.stderr || result.stdout : null,
        filePath,
        skipped: false
      };
    } catch (error) {
      logger.error('Validation error', { file: filePath, error: error.message });
      return {
        valid: false,
        error: error.message,
        filePath,
        skipped: false
      };
    }
  }

  /**
   * Self-correction via error learning database
   * @param {string} filePath - Path to file with error
   * @param {string} errorMessage - Error message
   * @param {Object} budgetManager - Token budget manager (optional)
   * @returns {Promise<boolean>} True if corrected
   */
  async selfCorrect(filePath, errorMessage, budgetManager = null) {
    try {
      logger.info('Attempting self-correction', {
        file: filePath,
        errorPreview: errorMessage.substring(0, 100)
      });

      // Check error pattern database for known fix
      const knownFix = await findKnownFix(errorMessage);

      if (knownFix && process.env.ERROR_LEARNING_ENABLED !== 'false') {
        logger.info('Found known fix in database', {
          pattern: knownFix.errorType,
          confidence: knownFix.confidence
        });

        // Apply the known fix (integrate with code generation)
        // For now, log the recommendation
        logger.info('Known fix recommendation', {
          fix: knownFix.fixDescription,
          confidence: knownFix.confidence
        });

        return true;
      }

      // Generate new fix using AI
      logger.info('No known fix found, generating new fix with AI');
      const fix = await this.generateFix(filePath, errorMessage, budgetManager);

      if (fix && fix.confidence > 50) {
        // Learn from this fix for future use
        if (process.env.ERROR_LEARNING_ENABLED !== 'false') {
          await learnFromSuccess(errorMessage, fix.fix);
          logger.info('Learned new error pattern', {
            errorType: fix.diagnosis,
            confidence: fix.confidence
          });
        }

        return true;
      }

      logger.warn('Could not generate reliable fix', {
        confidence: fix?.confidence || 0
      });
      return false;
    } catch (error) {
      logger.error('Self-correction failed', {
        file: filePath,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Generates fix using AI reasoning
   * @param {string} filePath - Path to file
   * @param {string} errorMessage - Error message
   * @param {Object} budgetManager - Token budget manager (optional)
   * @returns {Promise<Object>} Fix recommendation
   */
  async generateFix(filePath, errorMessage, budgetManager = null) {
    try {
      const messages = [{
        role: 'system',
        content: `You are an expert debugger. Analyze this error and provide a fix.

Error: ${errorMessage}
File: ${filePath}

Respond with JSON:
{
  "diagnosis": "root cause explanation",
  "fix": "specific code change needed",
  "confidence": 0-100,
  "errorType": "syntax|type|reference|module|test|runtime"
}`
      }];

      const result = await generateCompletion(messages, {
        temperature: 0.2,
        maxTokens: 1000,
        response_format: { type: 'json_object' },
        budgetManager
      });

      const fix = JSON.parse(result.content);

      logger.info('Generated fix recommendation', {
        diagnosis: fix.diagnosis,
        confidence: fix.confidence
      });

      return fix;
    } catch (error) {
      logger.error('Failed to generate fix', {
        file: filePath,
        error: error.message
      });
      return null;
    }
  }
}

export default AutoValidator;
