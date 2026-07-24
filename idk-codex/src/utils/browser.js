/**
 * V2 Enhancement: Browser Automation Utilities
 * Purpose: Provides Playwright-based browser automation for web testing and scraping
 * Integration Point: Used by agent phases for testing web applications
 */

import { chromium } from 'playwright';
import logger from './logger.js';

let browserInstance = null;
let contextInstance = null;

/**
 * Launch browser instance (reuses existing instance if available)
 */
export async function launchBrowser(options = {}) {
  if (browserInstance && browserInstance.isConnected()) {
    logger.debug('Reusing existing browser instance');
    return browserInstance;
  }

  try {
    logger.info('Launching Chromium browser');
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      ...options
    });

    logger.info('Browser launched successfully');
    return browserInstance;
  } catch (error) {
    logger.error('Failed to launch browser', { error: error.message });
    throw error;
  }
}

/**
 * Create new browser context with optional configuration
 */
export async function createContext(options = {}) {
  const browser = await launchBrowser();

  try {
    contextInstance = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...options
    });

    logger.debug('Browser context created');
    return contextInstance;
  } catch (error) {
    logger.error('Failed to create browser context', { error: error.message });
    throw error;
  }
}

/**
 * Navigate to URL and return page object
 */
export async function navigateToUrl(url, options = {}) {
  const context = contextInstance || await createContext();

  try {
    const page = await context.newPage();
    logger.info('Navigating to URL', { url });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
      ...options
    });

    logger.info('Navigation successful', { url, title: await page.title() });
    return page;
  } catch (error) {
    logger.error('Navigation failed', { url, error: error.message });
    throw error;
  }
}

/**
 * Take screenshot of page or element
 */
export async function takeScreenshot(page, options = {}) {
  try {
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      ...options
    });

    logger.debug('Screenshot captured', {
      size: screenshot.length,
      fullPage: options.fullPage
    });

    return screenshot;
  } catch (error) {
    logger.error('Screenshot failed', { error: error.message });
    throw error;
  }
}

/**
 * Extract text content from page
 */
export async function extractPageText(page, selector = 'body') {
  try {
    const text = await page.locator(selector).innerText();
    logger.debug('Text extracted', {
      selector,
      length: text.length
    });
    return text;
  } catch (error) {
    logger.error('Text extraction failed', { selector, error: error.message });
    throw error;
  }
}

/**
 * Wait for element to be visible
 */
export async function waitForElement(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, {
      state: 'visible',
      timeout
    });
    logger.debug('Element found', { selector });
    return true;
  } catch (error) {
    logger.warn('Element not found', { selector, timeout });
    return false;
  }
}

/**
 * Click element by selector
 */
export async function clickElement(page, selector, options = {}) {
  try {
    await page.click(selector, {
      timeout: 5000,
      ...options
    });
    logger.debug('Element clicked', { selector });
    return true;
  } catch (error) {
    logger.error('Click failed', { selector, error: error.message });
    throw error;
  }
}

/**
 * Fill form field
 */
export async function fillField(page, selector, value, options = {}) {
  try {
    await page.fill(selector, value, {
      timeout: 5000,
      ...options
    });
    logger.debug('Field filled', { selector, valueLength: value.length });
    return true;
  } catch (error) {
    logger.error('Fill failed', { selector, error: error.message });
    throw error;
  }
}

/**
 * Execute JavaScript in page context
 */
export async function evaluateScript(page, script, ...args) {
  try {
    const result = await page.evaluate(script, ...args);
    logger.debug('Script evaluated successfully');
    return result;
  } catch (error) {
    logger.error('Script evaluation failed', { error: error.message });
    throw error;
  }
}

/**
 * Get page HTML content
 */
export async function getPageHtml(page) {
  try {
    const html = await page.content();
    logger.debug('HTML content retrieved', { length: html.length });
    return html;
  } catch (error) {
    logger.error('HTML retrieval failed', { error: error.message });
    throw error;
  }
}

/**
 * Check if element exists
 */
export async function elementExists(page, selector) {
  try {
    const count = await page.locator(selector).count();
    return count > 0;
  } catch (error) {
    logger.error('Element check failed', { selector, error: error.message });
    return false;
  }
}

/**
 * Get element attribute
 */
export async function getAttribute(page, selector, attribute) {
  try {
    const value = await page.locator(selector).getAttribute(attribute);
    logger.debug('Attribute retrieved', { selector, attribute, value });
    return value;
  } catch (error) {
    logger.error('Attribute retrieval failed', {
      selector,
      attribute,
      error: error.message
    });
    throw error;
  }
}

/**
 * Close specific page
 */
export async function closePage(page) {
  try {
    await page.close();
    logger.debug('Page closed');
  } catch (error) {
    logger.warn('Failed to close page', { error: error.message });
  }
}

/**
 * Close browser context
 */
export async function closeContext() {
  if (contextInstance) {
    try {
      await contextInstance.close();
      contextInstance = null;
      logger.debug('Browser context closed');
    } catch (error) {
      logger.warn('Failed to close context', { error: error.message });
    }
  }
}

/**
 * Close browser instance
 */
export async function closeBrowser() {
  await closeContext();

  if (browserInstance) {
    try {
      await browserInstance.close();
      browserInstance = null;
      logger.info('Browser closed');
    } catch (error) {
      logger.warn('Failed to close browser', { error: error.message });
    }
  }
}

/**
 * Run browser automation task with automatic cleanup
 */
export async function runBrowserTask(taskFn, options = {}) {
  let page = null;

  try {
    const context = await createContext(options.contextOptions);
    page = await context.newPage();

    const result = await taskFn(page);

    return {
      success: true,
      result
    };
  } catch (error) {
    logger.error('Browser task failed', { error: error.message, stack: error.stack });
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (page && options.closePage !== false) {
      await closePage(page).catch(() => {});
    }
    if (options.closeContext) {
      await closeContext().catch(() => {});
    }
    if (options.closeBrowser) {
      await closeBrowser().catch(() => {});
    }
  }
}

export default {
  launchBrowser,
  createContext,
  navigateToUrl,
  takeScreenshot,
  extractPageText,
  waitForElement,
  clickElement,
  fillField,
  evaluateScript,
  getPageHtml,
  elementExists,
  getAttribute,
  closePage,
  closeContext,
  closeBrowser,
  runBrowserTask
};
