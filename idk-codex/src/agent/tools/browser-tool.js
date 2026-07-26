/**
 * Browser Control Tool — Playwright-based browser automation
 * 
 * Gives MAX the ability to browse websites, click elements, type text,
 * take screenshots, and extract content — all autonomously.
 */

import logger from '../../utils/logger.js';

let browserInstance = null;
let pageInstance = null;

// Lazy-load playwright (may not be installed in all environments)
let playwrightLoaded = false;
let chromium = null;

async function loadPlaywright() {
  if (playwrightLoaded) return true;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
    playwrightLoaded = true;
    logger.info('Playwright loaded successfully');
    return true;
  } catch (err) {
    logger.warn('Playwright not installed — browser tools unavailable', { error: err.message });
    return false;
  }
}

async function getBrowser() {
  if (!await loadPlaywright()) return null;
  
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    logger.info('Browser launched');
  }
  return browserInstance;
}

async function getPage() {
  const br = await getBrowser();
  if (!br) return null;
  
  if (!pageInstance || pageInstance.isClosed()) {
    const context = await br.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    pageInstance = await context.newPage();
    logger.info('Browser page created');
  }
  return pageInstance;
}

export const browserTools = {
  browser_navigate: {
    name: 'browser_navigate',
    description: 'Navigate to a URL in the browser. Returns the page title.',
    params: { url: 'string (required) — URL to navigate to' },
    execute: async (args) => {
      if (!args.url) return 'Error: url is required';
      const p = await getPage();
      if (!p) return 'Error: browser not available (Playwright not installed)';
      
      try {
        await p.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 });
        const title = await p.title();
        logger.info('Browser navigated', { url: args.url, title });
        return 'Navigated to: ' + args.url + ' — Title: ' + title;
      } catch (err) {
        return 'Error navigating: ' + err.message;
      }
    }
  },

  browser_screenshot: {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page. Returns base64 image data.',
    params: {},
    execute: async () => {
      const p = await getPage();
      if (!p) return 'Error: browser not available';
      
      try {
        const buf = await p.screenshot({ type: 'png', fullPage: false });
        const b64 = 'data:image/png;base64,' + buf.toString('base64');
        logger.info('Browser screenshot taken', { sizeBytes: buf.length });
        return b64;
      } catch (err) {
        return 'Error taking screenshot: ' + err.message;
      }
    }
  },

  browser_click: {
    name: 'browser_click',
    description: 'Click an element by CSS selector or text content.',
    params: {
      selector: 'string (required) — CSS selector or text to click',
      by_text: 'boolean (optional) — if true, find element containing this text'
    },
    execute: async (args) => {
      if (!args.selector) return 'Error: selector is required';
      const p = await getPage();
      if (!p) return 'Error: browser not available';
      
      try {
        if (args.by_text === true || args.by_text === 'true') {
          await p.click('text=' + args.selector, { timeout: 10000 });
        } else {
          await p.click(args.selector, { timeout: 10000 });
        }
        await p.waitForTimeout(500);
        return 'Clicked: ' + args.selector;
      } catch (err) {
        return 'Error clicking: ' + err.message;
      }
    }
  },

  browser_type: {
    name: 'browser_type',
    description: 'Type text into an input field.',
    params: {
      selector: 'string (required) — CSS selector of the input',
      text: 'string (required) — text to type',
      clear_first: 'boolean (optional) — clear field first'
    },
    execute: async (args) => {
      if (!args.selector || args.text === undefined) return 'Error: selector and text required';
      const p = await getPage();
      if (!p) return 'Error: browser not available';
      
      try {
        if (args.clear_first) {
          await p.fill(args.selector, '');
        }
        await p.type(args.selector, args.text, { delay: 30 });
        return 'Typed "' + args.text + '" into ' + args.selector;
      } catch (err) {
        return 'Error typing: ' + err.message;
      }
    }
  },

  browser_get_text: {
    name: 'browser_get_text',
    description: 'Extract visible text from the page or a specific element.',
    params: { selector: 'string (optional) — CSS selector to limit extraction' },
    execute: async (args) => {
      const p = await getPage();
      if (!p) return 'Error: browser not available';
      
      try {
        const selector = args.selector || 'body';
        const text = await p.innerText(selector, { timeout: 10000 });
        const truncated = text.substring(0, 4000);
        if (text.length > 4000) {
          return truncated + '\n... (truncated, ' + text.length + ' chars total)';
        }
        return truncated;
      } catch (err) {
        return 'Error getting text: ' + err.message;
      }
    }
  },

  browser_wait: {
    name: 'browser_wait',
    description: 'Wait for an element to appear or for a set time.',
    params: {
      selector: 'string (optional) — wait for this element',
      ms: 'number (optional) — milliseconds to wait'
    },
    execute: async (args) => {
      const p = await getPage();
      if (!p) return 'Error: browser not available';
      
      try {
        if (args.selector) {
          await p.waitForSelector(args.selector, { timeout: 10000 });
          return 'Element appeared: ' + args.selector;
        }
        await p.waitForTimeout(parseInt(args.ms || '1000', 10));
        return 'Waited ' + (args.ms || 1000) + 'ms';
      } catch (err) {
        return 'Error waiting: ' + err.message;
      }
    }
  },

  browser_evaluate: {
    name: 'browser_evaluate',
    description: 'Run JavaScript in the browser page context.',
    params: { code: 'string (required) — JavaScript code to evaluate' },
    execute: async (args) => {
      if (!args.code) return 'Error: code is required';
      const p = await getPage();
      if (!p) return 'Error: browser not available';
      
      try {
        const result = await p.evaluate(args.code);
        const str = JSON.stringify(result, null, 2);
        return str.substring(0, 4000);
      } catch (err) {
        return 'Error evaluating: ' + err.message;
      }
    }
  },

  browser_close: {
    name: 'browser_close',
    description: 'Close the browser and free resources.',
    params: {},
    execute: async () => {
      try {
        if (pageInstance && !pageInstance.isClosed()) {
          await pageInstance.close();
        }
        if (browserInstance) {
          await browserInstance.close();
          browserInstance = null;
          pageInstance = null;
        }
        return 'Browser closed';
      } catch (err) {
        return 'Error closing browser: ' + err.message;
      }
    }
  }
};

export default browserTools;
