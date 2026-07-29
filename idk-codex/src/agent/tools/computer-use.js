/**
 * Computer Use Tool (Phase 11 — Computer Use)
 *
 * Gives MAX the ability to:
 *   1. Take screenshots of the browser viewport
 *   2. Send screenshots to vision LLMs for analysis
 *   3. Click at specific coordinates (not just CSS selectors)
 *   4. Type text anywhere on screen
 *   5. Scroll the page
 *   6. Extract text from specific regions
 *
 * This is the "Computer Use" pattern popularized by Claude 3.5 Computer Use.
 * Unlike the existing browser_* tools which use CSS selectors, these tools
 * work with COORDINATES — so the vision model can say "click at (340, 215)"
 * and we click exactly there.
 *
 * Powered by Playwright (headless Chromium).
 */

import logger from '../../utils/logger.js';

let browserInstance = null;
let pageInstance = null;

async function loadPlaywright() {
  try {
    const pw = await import('playwright');
    return pw.chromium;
  } catch (err) {
    logger.warn('Playwright not installed — computer use unavailable', { error: err.message });
    return null;
  }
}

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  const chromium = await loadPlaywright();
  if (!chromium) return null;
  browserInstance = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-dev-tools',
      '--window-size=1280,720'
    ]
  });
  logger.info('Computer Use: browser launched');
  return browserInstance;
}

async function getPage() {
  if (pageInstance && !pageInstance.isClosed()) return pageInstance;
  const br = await getBrowser();
  if (!br) return null;
  const context = await br.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  pageInstance = await context.newPage();
  logger.info('Computer Use: page created');
  return pageInstance;
}

export const computerUseTools = {
  /**
   * Take a screenshot of the current browser page.
   * Returns base64 PNG (can be sent to vision LLMs).
   */
  computer_screenshot: {
    name: 'computer_screenshot',
    description: 'Take a screenshot of the current browser page. Returns a base64 PNG image that can be analyzed. Use this to SEE what is on screen before clicking or typing. The viewport is 1280x720.',
    params: {},
    execute: async () => {
      try {
        const page = await getPage();
        if (!page) return 'Error: browser not available';
        const screenshot = await page.screenshot({ type: 'png', fullPage: false });
        const base64 = screenshot.toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;
        const url = page.url();
        logger.info('COMPUTER_USE_SCREENSHOT', { url, size: base64.length });
        return dataUrl; // The ReAct loop detects data:image/ prefix and sends as vision message
      } catch (err) {
        logger.error('Computer screenshot failed', { error: err.message });
        return `Error: ${err.message}`;
      }
    }
  },

  /**
   * Click at specific screen coordinates.
   * The vision model analyzes the screenshot and returns coordinates.
   */
  computer_click: {
    name: 'computer_click',
    description: 'Click at specific screen coordinates (x, y). The viewport is 1280x720. Use this after taking a screenshot and identifying where to click. Coordinates are in pixels from top-left.',
    params: {
      x: 'number (required) — X coordinate (0-1280)',
      y: 'number (required) — Y coordinate (0-720)',
      button: 'string (optional) — "left" (default), "right", "middle"'
    },
    execute: async (args) => {
      try {
        const x = parseInt(args.x, 10);
        const y = parseInt(args.y, 10);
        if (isNaN(x) || isNaN(y)) return 'Error: x and y must be numbers';
        const page = await getPage();
        if (!page) return 'Error: browser not available';

        const button = args.button || 'left';
        await page.mouse.click(x, y, { button });
        // Brief wait for page to react
        await page.waitForTimeout(500);
        const url = page.url();
        logger.info('COMPUTER_USE_CLICK', { x, y, button, url });
        return `Clicked at (${x}, ${y}) with ${button} button. Current URL: ${url}`;
      } catch (err) {
        logger.error('Computer click failed', { error: err.message });
        return `Error: ${err.message}`;
      }
    }
  },

  /**
   * Type text at the current cursor position (or at coordinates if specified).
   */
  computer_type: {
    name: 'computer_type',
    description: 'Type text at the current cursor position. Optionally click at (x, y) first to focus a specific input field. Use this to fill forms, type in search boxes, etc.',
    params: {
      text: 'string (required) — text to type',
      x: 'number (optional) — click here first to focus',
      y: 'number (optional) — click here first to focus',
      clear_first: 'boolean (optional) — clear the field before typing (default true)'
    },
    execute: async (args) => {
      try {
        if (!args.text) return 'Error: text is required';
        const page = await getPage();
        if (!page) return 'Error: browser not available';

        // Click at coordinates if provided (to focus the input)
        if (args.x !== undefined && args.y !== undefined) {
          const x = parseInt(args.x, 10);
          const y = parseInt(args.y, 10);
          if (!isNaN(x) && !isNaN(y)) {
            await page.mouse.click(x, y);
            await page.waitForTimeout(200);
          }
        }

        // Clear the field if requested
        if (args.clear_first !== false && args.clear_first !== 'false') {
          await page.keyboard.press('Control+a');
          await page.keyboard.press('Delete');
        }

        // Type the text (character by character for reliability)
        await page.keyboard.type(String(args.text), { delay: 10 });
        const url = page.url();
        logger.info('COMPUTER_USE_TYPE', { textLength: args.text.length, url });
        return `Typed "${args.text.substring(0, 50)}${args.text.length > 50 ? '...' : ''}" at current position. URL: ${url}`;
      } catch (err) {
        logger.error('Computer type failed', { error: err.message });
        return `Error: ${err.message}`;
      }
    }
  },

  /**
   * Press a keyboard key (Enter, Tab, Escape, etc.)
   */
  computer_key: {
    name: 'computer_key',
    description: 'Press a keyboard key. Use for Enter, Tab, Escape, Backspace, arrow keys, etc. Can also use combinations like "Control+c".',
    params: {
      key: 'string (required) — key to press (e.g. "Enter", "Tab", "Escape", "Control+a")'
    },
    execute: async (args) => {
      try {
        if (!args.key) return 'Error: key is required';
        const page = await getPage();
        if (!page) return 'Error: browser not available';
        await page.keyboard.press(args.key);
        await page.waitForTimeout(300);
        logger.info('COMPUTER_USE_KEY', { key: args.key });
        return `Pressed key: ${args.key}`;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }
  },

  /**
   * Scroll the page in a direction.
   */
  computer_scroll: {
    name: 'computer_scroll',
    description: 'Scroll the page up, down, left, or right.',
    params: {
      direction: 'string (required) — "up", "down", "left", or "right"',
      amount: 'number (optional) — pixels to scroll (default 300)'
    },
    execute: async (args) => {
      try {
        const direction = (args.direction || 'down').toLowerCase();
        const amount = parseInt(args.amount || '300', 10);
        const page = await getPage();
        if (!page) return 'Error: browser not available';

        const deltas = {
          up: [0, -amount],
          down: [0, amount],
          left: [-amount, 0],
          right: [amount, 0]
        };
        const [dx, dy] = deltas[direction] || deltas.down;
        await page.mouse.wheel(dx, dy);
        await page.waitForTimeout(500);
        logger.info('COMPUTER_USE_SCROLL', { direction, amount });
        return `Scrolled ${direction} by ${amount}px`;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }
  },

  /**
   * Navigate to a URL (same as browser_navigate but included here for completeness).
   */
  computer_navigate: {
    name: 'computer_navigate',
    description: 'Navigate the browser to a URL. Use this before taking screenshots.',
    params: {
      url: 'string (required) — URL to navigate to'
    },
    execute: async (args) => {
      try {
        if (!args.url) return 'Error: url is required';
        const page = await getPage();
        if (!page) return 'Error: browser not available';
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);
        const finalUrl = page.url();
        const title = await page.title();
        logger.info('COMPUTER_USE_NAVIGATE', { url: args.url, finalUrl, title });
        return `Navigated to ${args.url}\nTitle: ${title}\nFinal URL: ${finalUrl}`;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }
  },

  /**
   * Extract all visible text from the page (for reading content).
   */
  computer_read: {
    name: 'computer_read',
    description: 'Extract all visible text from the current page. Use this to read what is on screen without taking a screenshot (faster, cheaper than vision).',
    params: {},
    execute: async () => {
      try {
        const page = await getPage();
        if (!page) return 'Error: browser not available';
        const text = await page.evaluate(() => document.body.innerText);
        const truncated = text.length > 5000 ? text.substring(0, 5000) + '\n... (truncated)' : text;
        logger.info('COMPUTER_USE_READ', { textLength: text.length });
        return `=== Page text (${page.url()}) ===\n${truncated}`;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }
  },

  /**
   * Get the current page URL + title (quick status check).
   */
  computer_status: {
    name: 'computer_status',
    description: 'Get the current browser page URL + title. Use this to check where you are before taking action.',
    params: {},
    execute: async () => {
      try {
        const page = await getPage();
        if (!page) return 'Error: browser not available';
        const url = page.url();
        const title = await page.title();
        return `URL: ${url}\nTitle: ${title}`;
      } catch (err) {
        return `Error: ${err.message}`;
      }
    }
  }
};

export default { computerUseTools };
