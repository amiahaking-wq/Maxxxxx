/**
 * Error Resolution Loop
 * Main entry point for automatic error detection and resolution
 */

import { LogParser } from './log-parser.js';
import { DiagnosticScanner } from './diagnostic-scanner.js';
import { RepairEngine } from './repair-engine.js';
import logger from '../utils/logger.js';

export class ErrorResolutionLoop {
  constructor(workspacePath = process.env.SANDBOX_WORKSPACE || './sandbox-workspace') {
    this.parser = new LogParser();
    this.scanner = new DiagnosticScanner(workspacePath);
    this.repair = new RepairEngine(workspacePath);
    this.enabled = process.env.AUTO_ERROR_RESOLUTION !== 'false';
  }

  /**
   * Full error resolution pipeline
   */
  async resolveError(errorLogOrMessage, budgetManager = null) {
    if (!this.enabled) {
      logger.debug('Error resolution disabled');
      return { success: false, message: 'Error resolution disabled' };
    }

    logger.info('Starting error resolution loop');

    try {
      // Step 1: Parse error log
      const parseResult = this.parser.parseLog(errorLogOrMessage);

      if (!parseResult) {
        logger.info('No structured errors found in log');
        return {
          success: false,
          message: 'No structured errors detected',
          rawLog: errorLogOrMessage.substring(0, 500)
        };
      }

      const primaryError = parseResult.primaryError;

      logger.info('Error detected and parsed', {
        errorType: primaryError.type,
        category: primaryError.category,
        severity: primaryError.severity
      });

      // Step 2: Run diagnostic scan
      const diagnostics = await this.scanner.scanForError(primaryError);

      logger.info('Diagnostic scan complete', {
        issues: diagnostics.configIssues.length,
        recommendations: diagnostics.recommendations.length
      });

      // Step 3: Attempt repair
      if (diagnostics.recommendations.length > 0) {
        const repairResult = await this.repair.repairError(
          primaryError,
          diagnostics,
          budgetManager
        );

        return {
          success: repairResult.success,
          error: primaryError,
          diagnostics,
          repairSteps: repairResult.repairSteps,
          message: repairResult.message
        };
      }

      return {
        success: false,
        error: primaryError,
        diagnostics,
        message: 'No automatic fixes available for this error'
      };
    } catch (error) {
      logger.error('Error resolution loop failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        message: 'Error resolution loop encountered an error'
      };
    }
  }

  /**
   * Quick check if text contains errors
   */
  hasErrors(logText) {
    return this.parser.hasErrors(logText);
  }
}

// Export convenience function
export async function resolveError(errorLog, budgetManager = null) {
  const loop = new ErrorResolutionLoop();
  return loop.resolveError(errorLog, budgetManager);
}

export default ErrorResolutionLoop;
