/**
 * V2 Enhancement: Path Security Validator
 * Purpose: Validate file paths to prevent directory traversal and other security issues
 * Integration Point: Called in all filesystem operations
 */

import { resolve, normalize, isAbsolute } from 'path';
import { promises as fs } from 'fs';
import logger from '../utils/logger.js';

/**
 * Custom security error class
 */
export class SecurityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SecurityError';
    this.details = details;
  }
}

/**
 * Validate path safety against security threats
 * @param {string} filePath - Path to validate
 * @param {string} sandboxRoot - Sandbox root directory
 * @throws {SecurityError} If path is unsafe
 * @returns {string} Validated absolute path
 */
export function validatePathSafety(filePath, sandboxRoot) {
  try {
    // Ensure filePath is provided
    if (!filePath || typeof filePath !== 'string') {
      throw new SecurityError('Invalid file path: path must be a non-empty string', {
        providedPath: filePath
      });
    }

    // Normalize the sandbox root
    const normalizedRoot = normalize(resolve(sandboxRoot));

    // Check for null byte injection
    if (filePath.includes('\0')) {
      throw new SecurityError('Path contains null byte', {
        path: filePath,
        riskLevel: 'critical'
      });
    }

    // Check for directory traversal patterns
    const dangerousPatterns = [
      /\.\.\//,  // ../
      /\.\.\\/, // ..\
      /\/\.\./,  // /..
      /\\\.\./   // \..
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(filePath)) {
        throw new SecurityError('Path contains directory traversal sequence', {
          path: filePath,
          pattern: pattern.toString(),
          riskLevel: 'critical'
        });
      }
    }

    // Convert to absolute path if not already
    let absolutePath;
    if (isAbsolute(filePath)) {
      absolutePath = normalize(filePath);
    } else {
      absolutePath = normalize(resolve(normalizedRoot, filePath));
    }

    // Verify path is within sandbox
    if (!absolutePath.startsWith(normalizedRoot)) {
      throw new SecurityError('Path escapes sandbox boundary', {
        path: filePath,
        absolutePath,
        sandboxRoot: normalizedRoot,
        riskLevel: 'critical'
      });
    }

    // Check for suspicious extensions
    const suspiciousExtensions = [
      '.exe', '.dll', '.so', '.dylib',
      '.bat', '.cmd', '.sh',
      '.ps1', '.psm1'
    ];

    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    if (suspiciousExtensions.includes(ext)) {
      logger.warn('Suspicious file extension detected', {
        path: filePath,
        extension: ext,
        riskLevel: 'medium'
      });
    }

    logger.debug('Path validation passed', {
      originalPath: filePath,
      absolutePath,
      sandboxRoot: normalizedRoot
    });

    return absolutePath;
  } catch (error) {
    if (error instanceof SecurityError) {
      logger.error('Path security validation failed', {
        path: filePath,
        error: error.message,
        details: error.details
      });
      throw error;
    }

    logger.error('Path validation error', {
      path: filePath,
      error: error.message
    });
    throw new SecurityError('Path validation failed', {
      path: filePath,
      originalError: error.message
    });
  }
}

/**
 * Check if a path is a symlink (potential security issue)
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} True if path is a symlink
 */
export async function isSymlink(filePath) {
  try {
    const stats = await fs.lstat(filePath);
    return stats.isSymbolicLink();
  } catch (error) {
    // File doesn't exist or can't be accessed
    return false;
  }
}

/**
 * Validate path and check for symlinks
 * @param {string} filePath - Path to validate
 * @param {string} sandboxRoot - Sandbox root
 * @param {boolean} allowSymlinks - Whether to allow symlinks
 * @throws {SecurityError} If validation fails
 * @returns {Promise<string>} Validated path
 */
export async function validatePathWithSymlinkCheck(filePath, sandboxRoot, allowSymlinks = false) {
  // First validate the path structure
  const validatedPath = validatePathSafety(filePath, sandboxRoot);

  // Check for symlinks if not allowed
  if (!allowSymlinks) {
    const isLink = await isSymlink(validatedPath);
    if (isLink) {
      throw new SecurityError('Symlinks are not allowed', {
        path: filePath,
        riskLevel: 'high'
      });
    }
  }

  return validatedPath;
}

/**
 * Get safe file path within sandbox
 * Convenience wrapper around validatePathSafety
 * @param {string} filePath - File path
 * @param {string} sandboxRoot - Sandbox root
 * @returns {string} Safe absolute path
 */
export function getSafePath(filePath, sandboxRoot) {
  return validatePathSafety(filePath, sandboxRoot);
}

export default {
  validatePathSafety,
  validatePathWithSymlinkCheck,
  isSymlink,
  getSafePath,
  SecurityError
};
