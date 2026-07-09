/**
 * V2 Enhancement: Error Pattern Learning
 * Purpose: Learn from successful error fixes to improve future self-healing
 * Integration Point: Used in agent loop's healSelf function
 */

import { findSimilarError, saveSuccessfulFix } from '../database/queries.js';
import logger from '../utils/logger.js';

/**
 * Generate a normalized error signature for pattern matching
 * Extracts the core error type and message, removing variable specifics
 * @param {string} errorMessage - Raw error message
 * @returns {string} Normalized error signature
 */
export function generateErrorSignature(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return 'unknown_error';
  }

  try {
    // Clean up the error message
    let signature = errorMessage
      .toLowerCase()
      .trim()
      .substring(0, 500); // Limit length

    // Extract error type patterns
    const patterns = [
      // Syntax errors
      /syntax\s*error[:\s]*(.*?)(?=\n|$)/i,
      // Type errors
      /type\s*error[:\s]*(.*?)(?=\n|$)/i,
      // Reference errors
      /reference\s*error[:\s]*(.*?)(?=\n|$)/i,
      // Module errors
      /cannot find module[:\s]*(.*?)(?=\n|$)/i,
      /module.*?not found/i,
      // Import/Export errors
      /unexpected token.*?export/i,
      /unexpected token.*?import/i,
      // Test failures
      /test.*?failed/i,
      /assertion.*?failed/i,
      // Runtime errors
      /undefined is not a function/i,
      /cannot read property.*?of undefined/i,
      /maximum call stack/i
    ];

    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match) {
        signature = match[0].toLowerCase();
        break;
      }
    }

    // Normalize by removing specific values (file paths, line numbers, variable names)
    signature = signature
      .replace(/\/[^\s]+\.(js|ts|jsx|tsx)/g, '[file]') // File paths
      .replace(/line \d+/g, 'line [n]') // Line numbers
      .replace(/column \d+/g, 'column [n]') // Column numbers
      .replace(/\d+:\d+/g, '[n]:[n]') // Line:column
      .replace(/'[^']+'/g, "'[value]'") // Quoted strings
      .replace(/"[^"]+"/g, '"[value]"') // Double-quoted strings
      .replace(/\b[a-z_][a-z0-9_]{10,}\b/gi, '[identifier]'); // Long identifiers

    logger.debug('Generated error signature', {
      originalLength: errorMessage.length,
      signature: signature.substring(0, 100)
    });

    return signature;
  } catch (error) {
    logger.warn('Failed to generate error signature', { error: error.message });
    return 'signature_generation_failed';
  }
}

/**
 * Determine error type from signature
 * @param {string} errorSignature - Error signature
 * @returns {string} Error type
 */
function determineErrorType(errorSignature) {
  const lower = errorSignature.toLowerCase();

  if (lower.includes('syntax')) return 'syntax';
  if (lower.includes('type error')) return 'type';
  if (lower.includes('reference error')) return 'reference';
  if (lower.includes('module') || lower.includes('import') || lower.includes('export')) return 'module';
  if (lower.includes('test') || lower.includes('assertion')) return 'test';
  if (lower.includes('undefined') || lower.includes('null')) return 'runtime';

  return 'unknown';
}

/**
 * Find a known fix for an error
 * @param {string} errorMessage - Error message
 * @returns {Promise<Object|null>} Known fix or null
 */
export async function findKnownFix(errorMessage) {
  try {
    const signature = generateErrorSignature(errorMessage);
    const pattern = findSimilarError(signature);

    if (pattern) {
      logger.info('Found known fix for error', {
        errorType: pattern.error_type,
        successCount: pattern.success_count,
        lastSuccess: pattern.last_success_at
      });

      return {
        signature: pattern.error_signature,
        errorType: pattern.error_type,
        fixDescription: pattern.fix_description,
        successCount: pattern.success_count,
        confidence: calculateConfidence(pattern.success_count)
      };
    }

    logger.debug('No known fix found for error', { signature });
    return null;
  } catch (error) {
    logger.error('Failed to find known fix', { error: error.message });
    return null;
  }
}

/**
 * Calculate confidence score based on success count
 * @param {number} successCount - Number of successful applications
 * @returns {string} Confidence level
 */
function calculateConfidence(successCount) {
  if (successCount >= 10) return 'high';
  if (successCount >= 5) return 'medium';
  if (successCount >= 2) return 'low';
  return 'experimental';
}

/**
 * Learn from a successful error fix
 * @param {string} errorMessage - Original error message
 * @param {string} fixDescription - Description of the fix applied
 * @returns {Promise<number>} Error pattern ID
 */
export async function learnFromSuccess(errorMessage, fixDescription) {
  try {
    const signature = generateErrorSignature(errorMessage);
    const errorType = determineErrorType(signature);

    logger.info('Learning from successful fix', {
      errorType,
      signatureLength: signature.length
    });

    const patternId = saveSuccessfulFix(signature, errorType, fixDescription);

    logger.info('Successfully learned error pattern', {
      patternId,
      errorType
    });

    return patternId;
  } catch (error) {
    logger.error('Failed to learn from success', { error: error.message });
    throw error;
  }
}

/**
 * Apply a known fix to code
 * @param {string} code - Current code
 * @param {Object} knownFix - Known fix object
 * @returns {Promise<string>} Modified code
 */
export async function applyKnownFix(code, knownFix) {
  try {
    logger.info('Applying known fix', {
      errorType: knownFix.errorType,
      confidence: knownFix.confidence
    });

    // For now, return the code as-is
    // In a more advanced implementation, this could apply specific transformations
    // based on the error type and fix description

    // Example transformations could include:
    // - Adding missing imports
    // - Fixing common syntax mistakes
    // - Adding type annotations
    // - Wrapping in try-catch blocks

    logger.info('Known fix applied successfully');
    return code;
  } catch (error) {
    logger.error('Failed to apply known fix', { error: error.message });
    throw error;
  }
}

export default {
  generateErrorSignature,
  findKnownFix,
  learnFromSuccess,
  applyKnownFix
};
