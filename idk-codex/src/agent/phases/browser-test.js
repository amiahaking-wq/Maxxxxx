/**
 * V2 Enhancement: Browser Testing Phase
 * Purpose: Web application testing using Playwright automation
 * Integration Point: Optional phase triggered when testing web applications
 */

import logger from '../../utils/logger.js';
import {
  navigateToUrl,
  takeScreenshot,
  extractPageText,
  waitForElement,
  clickElement,
  fillField,
  runBrowserTask,
  closeBrowser
} from '../../utils/browser.js';
import { writeFileSafe } from '../../utils/filesystem.js';
import { join } from 'path';

const ENABLE_BROWSER_TESTING = process.env.ENABLE_BROWSER_TESTING !== 'false';
const TEST_TIMEOUT = parseInt(process.env.BROWSER_TEST_TIMEOUT || '60000', 10);

/**
 * Execute browser-based testing for web applications
 */
export async function browserTest(context = {}) {
  if (!ENABLE_BROWSER_TESTING) {
    logger.info('Browser testing disabled, skipping phase');
    return {
      success: true,
      skipped: true,
      message: 'Browser testing is disabled'
    };
  }

  const { testUrl, testPlan, sessionId } = context;

  if (!testUrl) {
    logger.debug('No test URL provided, skipping browser testing');
    return {
      success: true,
      skipped: true,
      message: 'No web application to test'
    };
  }

  logger.info('Starting browser testing phase', { testUrl });

  const results = {
    success: true,
    testUrl,
    tests: [],
    screenshots: [],
    errors: [],
    startTime: new Date().toISOString()
  };

  try {
    const taskResult = await runBrowserTask(async (page) => {
      // Navigate to application
      await page.goto(testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: TEST_TIMEOUT
      });

      const pageTitle = await page.title();
      logger.info('Application loaded', { title: pageTitle });

      // Take initial screenshot
      const initialScreenshot = await takeScreenshot(page, { fullPage: true });
      const screenshotPath = join(
        process.env.SANDBOX_WORKSPACE || './sandbox-workspace',
        'screenshots',
        `test-${sessionId}-initial.png`
      );
      await writeFileSafe(screenshotPath, initialScreenshot);
      results.screenshots.push({
        name: 'initial',
        path: screenshotPath,
        timestamp: new Date().toISOString()
      });

      // Execute test plan if provided
      if (testPlan && Array.isArray(testPlan.steps)) {
        for (const [index, step] of testPlan.steps.entries()) {
          logger.info(`Executing test step ${index + 1}`, { step: step.description });

          try {
            await executeTestStep(page, step, results);
            results.tests.push({
              step: index + 1,
              description: step.description,
              status: 'passed',
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            logger.error(`Test step ${index + 1} failed`, {
              step: step.description,
              error: error.message
            });
            results.tests.push({
              step: index + 1,
              description: step.description,
              status: 'failed',
              error: error.message,
              timestamp: new Date().toISOString()
            });
            results.errors.push({
              step: index + 1,
              message: error.message
            });

            // Take screenshot on failure
            const errorScreenshot = await takeScreenshot(page);
            const errorScreenshotPath = join(
              process.env.SANDBOX_WORKSPACE || './sandbox-workspace',
              'screenshots',
              `test-${sessionId}-error-step-${index + 1}.png`
            );
            await writeFileSafe(errorScreenshotPath, errorScreenshot);
            results.screenshots.push({
              name: `error-step-${index + 1}`,
              path: errorScreenshotPath,
              timestamp: new Date().toISOString()
            });

            // Fail fast or continue based on step criticality
            if (step.critical !== false) {
              break;
            }
          }
        }
      } else {
        // Basic smoke tests if no plan provided
        const smokeTests = await performSmokeTests(page);
        results.tests.push(...smokeTests);
      }

      // Take final screenshot
      const finalScreenshot = await takeScreenshot(page, { fullPage: true });
      const finalScreenshotPath = join(
        process.env.SANDBOX_WORKSPACE || './sandbox-workspace',
        'screenshots',
        `test-${sessionId}-final.png`
      );
      await writeFileSafe(finalScreenshotPath, finalScreenshot);
      results.screenshots.push({
        name: 'final',
        path: finalScreenshotPath,
        timestamp: new Date().toISOString()
      });

      return results;
    }, {
      closePage: true,
      closeContext: true,
      closeBrowser: true
    });

    if (taskResult.success) {
      results.endTime = new Date().toISOString();
      results.success = results.errors.length === 0;
      results.summary = generateTestSummary(results);

      logger.info('Browser testing completed', {
        success: results.success,
        totalTests: results.tests.length,
        passed: results.tests.filter(t => t.status === 'passed').length,
        failed: results.tests.filter(t => t.status === 'failed').length
      });

      return results;
    } else {
      throw new Error(taskResult.error);
    }
  } catch (error) {
    logger.error('Browser testing phase failed', {
      error: error.message,
      stack: error.stack
    });

    results.success = false;
    results.error = error.message;
    results.endTime = new Date().toISOString();

    return results;
  } finally {
    // Ensure browser is closed
    await closeBrowser().catch(() => {});
  }
}

/**
 * Execute individual test step
 */
async function executeTestStep(page, step, results) {
  const { action, selector, value, expected } = step;

  switch (action) {
    case 'navigate':
      await page.goto(value, { waitUntil: 'domcontentloaded' });
      break;

    case 'click':
      await clickElement(page, selector);
      await page.waitForTimeout(500); // Allow for UI updates
      break;

    case 'fill':
      await fillField(page, selector, value);
      break;

    case 'wait':
      await waitForElement(page, selector, parseInt(value || '5000', 10));
      break;

    case 'check_exists':
      const exists = await page.locator(selector).count() > 0;
      if (!exists) {
        throw new Error(`Element not found: ${selector}`);
      }
      break;

    case 'check_text':
      const text = await page.locator(selector).innerText();
      if (!text.includes(expected)) {
        throw new Error(`Text mismatch. Expected: "${expected}", Got: "${text}"`);
      }
      break;

    case 'check_visible':
      const visible = await page.locator(selector).isVisible();
      if (!visible) {
        throw new Error(`Element not visible: ${selector}`);
      }
      break;

    case 'screenshot':
      const screenshot = await takeScreenshot(page);
      const path = join(
        process.env.SANDBOX_WORKSPACE || './sandbox-workspace',
        'screenshots',
        value || `step-${Date.now()}.png`
      );
      await writeFileSafe(path, screenshot);
      results.screenshots.push({
        name: step.description,
        path,
        timestamp: new Date().toISOString()
      });
      break;

    default:
      logger.warn('Unknown test action', { action });
  }
}

/**
 * Perform basic smoke tests
 */
async function performSmokeTests(page) {
  const tests = [];

  // Test 1: Page loaded
  tests.push({
    description: 'Page loads successfully',
    status: 'passed',
    timestamp: new Date().toISOString()
  });

  // Test 2: No JavaScript errors
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForTimeout(2000);

  tests.push({
    description: 'No JavaScript errors',
    status: errors.length === 0 ? 'passed' : 'failed',
    error: errors.length > 0 ? errors.join(', ') : undefined,
    timestamp: new Date().toISOString()
  });

  // Test 3: Page has content
  const bodyText = await extractPageText(page, 'body');
  tests.push({
    description: 'Page has content',
    status: bodyText.length > 100 ? 'passed' : 'failed',
    error: bodyText.length <= 100 ? 'Page appears empty' : undefined,
    timestamp: new Date().toISOString()
  });

  return tests;
}

/**
 * Generate test summary report
 */
function generateTestSummary(results) {
  const total = results.tests.length;
  const passed = results.tests.filter(t => t.status === 'passed').length;
  const failed = results.tests.filter(t => t.status === 'failed').length;

  return {
    total,
    passed,
    failed,
    passRate: total > 0 ? ((passed / total) * 100).toFixed(2) + '%' : 'N/A',
    screenshots: results.screenshots.length,
    errors: results.errors.length,
    duration: results.endTime
      ? new Date(results.endTime) - new Date(results.startTime)
      : null
  };
}

export default browserTest;
