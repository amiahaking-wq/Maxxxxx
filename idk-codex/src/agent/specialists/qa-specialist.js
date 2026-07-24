import { SpecialistAgent } from './base.js';
import { executeTestPhase } from '../phases/test.js';
import { execSync } from 'child_process';
import logger from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * QA Specialist
 *
 * Handles testing and quality assurance:
 * - Running test suites
 * - Fixing test failures
 * - Test coverage analysis
 * - Performance testing
 *
 * Based on Claude Code's QA specialist implementation
 */
export class QASpecialist extends SpecialistAgent {
  constructor() {
    super(
      'qa',
      ['test', 'testing', 'qa', 'quality assurance', 'coverage', 'validate'],
      'Handles testing, test fixes, and quality assurance'
    );

    this.maxRetries = 10;
  }

  /**
   * Execute QA task
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async execute(task, context) {
    try {
      const taskStr = typeof task === 'string' ? task : task.description || '';
      this.log('Executing QA task', { task: taskStr });

      // Route to appropriate handler
      if (taskStr.toLowerCase().includes('run test')) {
        return await this.runTests(task, context);
      } else if (taskStr.toLowerCase().includes('fix')) {
        return await this.fixTestFailures(task, context);
      } else if (taskStr.toLowerCase().includes('coverage')) {
        return await this.checkCoverage(task, context);
      } else {
        // Default to running tests
        return await this.runTests(task, context);
      }
    } catch (error) {
      this.logError('QA task failed', error, { task });
      return this.failure(error.message, { task });
    }
  }

  /**
   * Run test suite
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Test result
   */
  async runTests(task, context) {
    try {
      this.log('Running test suite');

      const {
        workingDir = process.cwd(),
        testCommand = null
      } = context;

      // Determine test command
      let command = testCommand;
      if (!command) {
        command = await this.detectTestCommand(workingDir);
      }

      if (!command) {
        return this.failure('No test command found');
      }

      this.log('Executing test command', { command });

      // Run tests
      let output = '';
      let exitCode = 0;

      try {
        output = execSync(command, {
          cwd: workingDir,
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      } catch (error) {
        exitCode = error.status || 1;
        output = error.stdout + error.stderr;
      }

      // Parse test results
      const result = this.parseTestOutput(output);
      result.exitCode = exitCode;
      result.passed = exitCode === 0;
      result.command = command;

      return this.success(
        result,
        result.passed
          ? `All tests passed (${result.totalTests} tests)`
          : `Tests failed (${result.failedTests}/${result.totalTests} failures)`
      );
    } catch (error) {
      this.logError('Failed to run tests', error);
      return this.failure(error.message);
    }
  }

  /**
   * Fix test failures
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Fix result
   */
  async fixTestFailures(task, context) {
    try {
      this.log('Attempting to fix test failures');

      let retryCount = 0;
      let lastResult = null;

      while (retryCount < this.maxRetries) {
        // Run tests
        const testResult = await this.runTests(task, context);

        if (testResult.data.passed) {
          return this.success(
            {
              fixed: true,
              retries: retryCount,
              testResult: testResult.data
            },
            `Test failures fixed after ${retryCount} retries`
          );
        }

        lastResult = testResult;

        // Use existing test phase for AI-powered fixing
        if (context.budgetManager) {
          this.log('Using AI to fix test failures', { retry: retryCount + 1 });

          const fixResult = await executeTestPhase(
            { filesModified: context.filesModified || [] },
            context.budgetManager
          );

          if (!fixResult.success) {
            this.log('AI fix attempt failed', { error: fixResult.error });
          }
        }

        retryCount++;
      }

      return this.failure(
        `Failed to fix tests after ${this.maxRetries} retries`,
        {
          retries: retryCount,
          lastResult: lastResult?.data
        }
      );
    } catch (error) {
      this.logError('Failed to fix test failures', error);
      return this.failure(error.message);
    }
  }

  /**
   * Check test coverage
   *
   * @param {Object} task - Task details
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Coverage result
   */
  async checkCoverage(task, context) {
    try {
      this.log('Checking test coverage');

      const {
        workingDir = process.cwd(),
        coverageCommand = 'npm run test:coverage'
      } = context;

      let output = '';
      try {
        output = execSync(coverageCommand, {
          cwd: workingDir,
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      } catch (error) {
        output = error.stdout + error.stderr;
      }

      // Parse coverage report
      const coverage = this.parseCoverageOutput(output);

      return this.success(
        coverage,
        `Test coverage: ${coverage.overall}%`
      );
    } catch (error) {
      this.logError('Failed to check coverage', error);
      return this.failure(error.message);
    }
  }

  /**
   * Detect test command from package.json
   *
   * @param {string} workingDir - Working directory
   * @returns {Promise<string|null>} Test command or null
   */
  async detectTestCommand(workingDir) {
    try {
      const packagePath = path.join(workingDir, 'package.json');
      if (!fs.existsSync(packagePath)) {
        return null;
      }

      const pkg = JSON.parse(await fs.promises.readFile(packagePath, 'utf-8'));

      if (pkg.scripts?.test) {
        return 'npm test';
      }

      if (pkg.scripts?.['test:unit']) {
        return 'npm run test:unit';
      }

      // Check for common test frameworks
      if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
        return 'npx jest';
      }

      if (pkg.devDependencies?.mocha || pkg.dependencies?.mocha) {
        return 'npx mocha';
      }

      return null;
    } catch (error) {
      logger.error('Failed to detect test command', { error: error.message });
      return null;
    }
  }

  /**
   * Parse test output
   *
   * @param {string} output - Test output
   * @returns {Object} Parsed test result
   */
  parseTestOutput(output) {
    const result = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      failures: [],
      output: output.substring(0, 5000) // Truncate for storage
    };

    // Jest output parsing
    if (output.includes('Tests:')) {
      const testsMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (testsMatch) {
        result.failedTests = parseInt(testsMatch[1]);
        result.passedTests = parseInt(testsMatch[2]);
        result.totalTests = parseInt(testsMatch[3]);
      }
    }

    // Mocha output parsing
    if (output.includes('passing') || output.includes('failing')) {
      const passingMatch = output.match(/(\d+)\s+passing/);
      const failingMatch = output.match(/(\d+)\s+failing/);

      if (passingMatch) result.passedTests = parseInt(passingMatch[1]);
      if (failingMatch) result.failedTests = parseInt(failingMatch[1]);
      result.totalTests = result.passedTests + result.failedTests;
    }

    // Extract failure messages
    const failureRegex = /✕\s+(.*?)(?=\n\s*at|$)/gs;
    let match;
    while ((match = failureRegex.exec(output)) !== null && result.failures.length < 5) {
      result.failures.push(match[1].trim());
    }

    return result;
  }

  /**
   * Parse coverage output
   *
   * @param {string} output - Coverage output
   * @returns {Object} Parsed coverage result
   */
  parseCoverageOutput(output) {
    const coverage = {
      overall: 0,
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0
    };

    // Jest coverage parsing
    const overallMatch = output.match(/All files\s+\|\s+([\d.]+)/);
    if (overallMatch) {
      coverage.overall = parseFloat(overallMatch[1]);
    }

    const stmtMatch = output.match(/Statements\s+:\s+([\d.]+)/);
    if (stmtMatch) {
      coverage.statements = parseFloat(stmtMatch[1]);
    }

    const branchMatch = output.match(/Branch\s+:\s+([\d.]+)/);
    if (branchMatch) {
      coverage.branches = parseFloat(branchMatch[1]);
    }

    const funcMatch = output.match(/Functions\s+:\s+([\d.]+)/);
    if (funcMatch) {
      coverage.functions = parseFloat(funcMatch[1]);
    }

    const lineMatch = output.match(/Lines\s+:\s+([\d.]+)/);
    if (lineMatch) {
      coverage.lines = parseFloat(lineMatch[1]);
    }

    return coverage;
  }
}
