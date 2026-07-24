import { toTelegram } from '../ui/parsers/jsx-parser.js';
import logger from '../utils/logger.js';

/**
 * Message Formatter for Telegram
 *
 * Handles formatting of agent messages for Telegram display.
 * Supports:
 * - JSX component parsing
 * - Markdown conversion
 * - Message truncation
 * - Special character escaping
 *
 * Based on Claude Code's message formatting system
 */

const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

/**
 * Format a message for Telegram
 *
 * @param {string} content - Message content (may contain JSX and markdown)
 * @param {Object} options - Formatting options
 * @param {boolean} options.parseMode - Telegram parse mode ('Markdown', 'MarkdownV2', 'HTML')
 * @param {boolean} options.truncate - Whether to truncate long messages
 * @param {boolean} options.escapeMarkdown - Whether to escape markdown characters
 * @returns {string} Formatted message
 */
export function formatMessage(content, options = {}) {
  const {
    parseMode = 'HTML',
    truncate = true,
    escapeMarkdown = false
  } = options;

  try {
    logger.debug('Formatting message for Telegram', { parseMode, truncate });

    // Step 1: Parse JSX components
    let formatted = toTelegram(content);

    // Step 2: Convert markdown based on parse mode
    if (parseMode === 'Markdown') {
      formatted = convertToMarkdown(formatted, escapeMarkdown);
    } else if (parseMode === 'MarkdownV2') {
      formatted = convertToMarkdownV2(formatted);
    } else if (parseMode === 'HTML') {
      formatted = convertToHTML(formatted);
    }

    // Step 3: Truncate if needed
    if (truncate && formatted.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
      formatted = truncateMessage(formatted);
    }

    return formatted;
  } catch (error) {
    logger.error('Failed to format message', { error: error.message });
    return content; // Return original on error
  }
}

/**
 * Convert to Telegram Markdown format
 *
 * @param {string} text - Text to convert
 * @param {boolean} escape - Whether to escape special characters
 * @returns {string} Markdown text
 */
function convertToMarkdown(text, escape = false) {
  let result = text;

  // Convert bold: **text** stays as **text** (Telegram uses *)
  result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*');

  // Convert italic: _text_ or *text* to _text_
  result = result.replace(/(?<!\*)([*_])([^*_]+)\1(?!\*)/g, '_$2_');

  // Convert inline code: `code` stays as `code`

  // Convert code blocks: ```language\ncode\n``` stays the same

  if (escape) {
    result = escapeMarkdownChars(result);
  }

  return result;
}

/**
 * Convert to Telegram MarkdownV2 format
 *
 * @param {string} text - Text to convert
 * @returns {string} MarkdownV2 text
 */
function convertToMarkdownV2(text) {
  // MarkdownV2 requires escaping: _*[]()~`>#+-=|{}.!
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];

  let result = text;

  // Escape special characters outside of code blocks and inline code
  const codeBlockRegex = /```[\s\S]*?```/g;
  const inlineCodeRegex = /`[^`]+`/g;

  // Extract code blocks and inline code
  const codeBlocks = [];
  result = result.replace(codeBlockRegex, match => {
    codeBlocks.push(match);
    return `__CODEBLOCK${codeBlocks.length - 1}__`;
  });

  const inlineCodes = [];
  result = result.replace(inlineCodeRegex, match => {
    inlineCodes.push(match);
    return `__INLINECODE${inlineCodes.length - 1}__`;
  });

  // Escape special characters in remaining text
  for (const char of specialChars) {
    result = result.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
  }

  // Restore code blocks and inline code
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`__CODEBLOCK${i}__`, codeBlocks[i]);
  }
  for (let i = 0; i < inlineCodes.length; i++) {
    result = result.replace(`__INLINECODE${i}__`, inlineCodes[i]);
  }

  return result;
}

/**
 * Convert to Telegram HTML format
 *
 * @param {string} text - Text to convert
 * @returns {string} HTML text
 */
function convertToHTML(text) {
  let result = text;

  // Convert bold: **text** to <b>text</b>
  result = result.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  // Convert italic: _text_ to <i>text</i>
  result = result.replace(/_([^_]+)_/g, '<i>$1</i>');

  // Convert inline code: `code` to <code>code</code>
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Convert code blocks: ```language\ncode\n``` to <pre>code</pre>
  result = result.replace(/```(\w+)?\n([\s\S]+?)\n```/g, '<pre>$2</pre>');

  return result;
}

/**
 * Escape markdown special characters
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeMarkdownChars(text) {
  // Don't escape characters inside code blocks or inline code
  const codeBlockRegex = /```[\s\S]*?```/g;
  const inlineCodeRegex = /`[^`]+`/g;

  const codeBlocks = [];
  let result = text.replace(codeBlockRegex, match => {
    codeBlocks.push(match);
    return `__CODEBLOCK${codeBlocks.length - 1}__`;
  });

  const inlineCodes = [];
  result = result.replace(inlineCodeRegex, match => {
    inlineCodes.push(match);
    return `__INLINECODE${inlineCodes.length - 1}__`;
  });

  // Escape underscore and asterisk in remaining text
  result = result.replace(/([_*])/g, '\\$1');

  // Restore code blocks and inline code
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`__CODEBLOCK${i}__`, codeBlocks[i]);
  }
  for (let i = 0; i < inlineCodes.length; i++) {
    result = result.replace(`__INLINECODE${i}__`, inlineCodes[i]);
  }

  return result;
}

/**
 * Truncate long messages
 *
 * @param {string} text - Text to truncate
 * @returns {string} Truncated text
 */
function truncateMessage(text) {
  if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
    return text;
  }

  const truncated = text.substring(0, MAX_TELEGRAM_MESSAGE_LENGTH - 100);
  return truncated + '\n\n... (message truncated)';
}

/**
 * Split long messages into multiple parts
 *
 * @param {string} text - Text to split
 * @param {number} maxLength - Maximum length per part
 * @returns {Array<string>} Array of message parts
 */
export function splitMessage(text, maxLength = MAX_TELEGRAM_MESSAGE_LENGTH) {
  if (text.length <= maxLength) {
    return [text];
  }

  const parts = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }

    // Find a good split point (preferably at a newline)
    let splitAt = maxLength;
    const lastNewline = remaining.lastIndexOf('\n', maxLength);

    if (lastNewline > maxLength * 0.7) {
      splitAt = lastNewline;
    }

    parts.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trim();
  }

  return parts;
}

/**
 * Format error message for Telegram
 *
 * @param {Error} error - Error object
 * @returns {string} Formatted error message
 */
export function formatError(error) {
  return `❌ <b>Error:</b> ${error.message}\n\nPlease try again or contact support if the issue persists.`;
}

/**
 * Format success message for Telegram
 *
 * @param {string} message - Success message
 * @returns {string} Formatted success message
 */
export function formatSuccess(message) {
  return `✅ <b>Success:</b> ${message}`;
}

/**
 * Format progress update for Telegram
 *
 * @param {string} phase - Current phase
 * @param {string} status - Status (running, success, failed)
 * @param {Object} details - Additional details
 * @returns {string} Formatted progress message
 */
export function formatProgress(phase, status, details = {}) {
  const statusEmoji = {
    running: '⏳',
    success: '✅',
    failed: '❌',
    pending: '⏸'
  };

  const emoji = statusEmoji[status] || '🔵';
  let message = `${emoji} <b>${phase.toUpperCase()}</b> - ${status}`;

  if (details.message) {
    message += `\n${details.message}`;
  }

  return message;
}

/**
 * Format SOP worksheet summary for Telegram
 *
 * @param {string} worksheetPath - Path to worksheet
 * @param {Object} results - Execution results
 * @returns {string} Formatted summary
 */
export function formatSOPSummary(worksheetPath, results = {}) {
  let message = `📋 <b>SOP Worksheet</b>\n\n`;
  message += `Path: <code>${worksheetPath}</code>\n\n`;

  if (results.success) {
    message += `✅ <b>Status:</b> Completed successfully\n\n`;

    if (results.results) {
      message += `<b>Steps completed:</b>\n`;
      for (const [stepName, stepResult] of Object.entries(results.results)) {
        const emoji = stepResult.success ? '✅' : '❌';
        message += `${emoji} ${stepName}\n`;
      }
    }
  } else {
    message += `❌ <b>Status:</b> Failed\n`;
    message += `Error: ${results.error}\n`;
  }

  return message;
}

/**
 * Format tool use event for Telegram
 *
 * @param {string} toolName - Name of the tool
 * @param {Object} details - Tool execution details
 * @returns {string} Formatted message
 */
export function formatToolUse(toolName, details = {}) {
  const toolIcons = {
    read_file: '📖',
    write_file: '✏️',
    edit_file: '📝',
    run_command: '⚙️',
    list_files: '📁',
    search_code: '🔍',
    install_package: '📦',
    run_tests: '🧪',
    git_operations: '🔀',
    create_directory: '📂',
    web_fetch: '🌐',
    check_syntax: '✅'
  };

  const icon = toolIcons[toolName] || '🔧';
  let message = `${icon} <b>${toolName}</b>`;

  // Add specific details based on tool
  switch (toolName) {
    case 'read_file':
      message += `: Reading <code>${details.path}</code>`;
      break;
    case 'write_file':
      message += `: Writing <code>${details.path}</code>`;
      break;
    case 'edit_file':
      message += `: Editing <code>${details.path}</code>`;
      break;
    case 'run_command':
      const cmd = details.command?.substring(0, 50) || '';
      message += `: Running <code>${cmd}${details.command?.length > 50 ? '...' : ''}</code>`;
      break;
    case 'list_files':
      message += `: Listing files in <code>${details.path || '.'}</code>`;
      break;
    case 'search_code':
      message += `: Searching for "${details.query}"`;
      break;
    case 'install_package':
      const packages = details.packages?.join(', ') || '';
      message += `: Installing ${packages}`;
      break;
    case 'run_tests':
      message += `: Running tests`;
      break;
    case 'git_operations':
      message += `: Git ${details.operation || 'operation'}`;
      break;
    case 'create_directory':
      message += `: Creating <code>${details.path}</code>`;
      break;
    case 'web_fetch':
      message += `: Fetching ${details.url}`;
      break;
    case 'check_syntax':
      message += `: Checking <code>${details.path}</code>`;
      break;
    default:
      if (details.path) {
        message += `: ${details.path}`;
      } else if (details.command) {
        message += `: ${details.command.substring(0, 50)}`;
      }
  }

  return message;
}
