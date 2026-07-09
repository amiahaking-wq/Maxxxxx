import { executeTestCommand, executeCommandSafely } from '../../security/sandbox.js';
import { existsSafe, readFileSafe } from '../../utils/filesystem.js';
import logger from '../../utils/logger.js';

/**
 * Detect test command from package.json
 * @returns {Promise<string|null>} Test command or null
 */
async function detectTestCommand() {
  try {
    if (await existsSafe('package.json')) {
      const packageJson = await readFileSafe('package.json');
      const pkg = JSON.parse(packageJson);

      if (pkg.scripts && pkg.scripts.test) {
        return 'npm test';
      }
    }
  } catch (error) {
    logger.warn('Failed to detect test command', { error: error.message });
  }

  return null;
}

/**
 * Execute TEST phase
 * @param {Object} executeResult - Result from execute phase
 * @param {Object} options - Test options
 * @returns {Promise<Object>} Test result
 */
export async function executeTestPhase(executeResult, options = {}) {
  try {
    logger.logPhase('test', 'started');

    // Detect test command
    const testCommand = options.testCommand || await detectTestCommand();

    if (!testCommand) {
      logger.info('No test command found, skipping test phase');
      return {
        success: true,
        skipped: true,
        reason: 'No test command configured'
      };
    }

    // Execute tests
    logger.info('Running tests', { command: testCommand });

    let testResult;
    try {
      testResult = await executeTestCommand(testCommand, {
        timeout: options.timeout || 120000, // 2 minutes default
        sessionId: options.sessionId
      });
    } catch (error) {
      testResult = {
        exitCode: 1,
        stdout: '',
        stderr: error.message,
        timedOut: true
      };
    }

    const success = testResult.exitCode === 0;

    // Parse test output for insights
    const testInsights = parseTestOutput(testResult.stdout, testResult.stderr);

    logger.logPhase('test', success ? 'passed' : 'failed', {
      exitCode: testResult.exitCode,
      duration: testInsights.duration
    });

    return {
      success,
      exitCode: testResult.exitCode,
      stdout: testResult.stdout,
      stderr: testResult.stderr,
      timedOut: testResult.timedOut,
      insights: testInsights
    };
  } catch (error) {
    logger.error('Test phase failed', { error: error.message });
    return {
      success: false,
      error: error.message,
      skipped: false
    };
  }
}

/**
 * Parse test output for insights
 * @param {string} stdout - Standard output
 * @param {string} stderr - Standard error
 * @returns {Object} Test insights
 */
function parseTestOutput(stdout, stderr) {
  const insights = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    duration: null,
    errors: []
  };

  const output = stdout + '\n' + stderr;

  // Jest/Mocha patterns
  const jestMatch = output.match(/Tests:\s+(\d+)\s+passed.*?(\d+)\s+total/);
  if (jestMatch) {
    insights.passedTests = parseInt(jestMatch[1], 10);
    insights.totalTests = parseInt(jestMatch[2], 10);
    insights.failedTests = insights.totalTests - insights.passedTests;
  }

  // Duration patterns
  const durationMatch = output.match(/Time:\s+([\d.]+)s/);
  if (durationMatch) {
    insights.duration = parseFloat(durationMatch[1]);
  }

  // Extract error messages
  const errorMatches = output.matchAll(/Error:\s+(.+)/g);
  for (const match of errorMatches) {
    insights.errors.push(match[1].trim());
  }

  // Extract failing test names
  const failingTestMatches = output.matchAll(/●\s+(.+)/g);
  for (const match of failingTestMatches) {
    insights.errors.push(match[1].trim());
  }

  return insights;
}

/**
 * Validate code without running tests (static analysis)
 * @param {Array<string>} files - Files to validate
 * @returns {Promise<Object>} Validation result
 */
export async function validateCode(files) {
  try {
    logger.info('Performing static code validation', { fileCount: files.length });

    const results = [];

    // Check for syntax errors using Node
    for (const file of files) {
      if (!file.endsWith('.js') && !file.endsWith('.ts')) {
        continue;
      }

      try {
        const result = await executeCommandSafely('node', ['--check', file], {
          timeout: 10000
        });

        results.push({
          file,
          valid: result.exitCode === 0,
          errors: result.stderr ? [result.stderr] : []
        });
      } catch (error) {
        results.push({
          file,
          valid: false,
          errors: [error.message]
        });
      }
    }

    const allValid = results.every(r => r.valid);

    return {
      success: allValid,
      results
    };
  } catch (error) {
    logger.error('Code validation failed', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  executeTestPhase,
  validateCode,
  detectTestCommand
};
