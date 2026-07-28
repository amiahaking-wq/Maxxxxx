/**
 * Telegram Safe Send Utility
 *
 * Telegram's Markdown parser is strict and crashes on common characters like
 * _, *, [, ], (, ), ~, `, >, #, +, -, =, |, {, }, ., !
 * when they appear in text that wasn't authored as Markdown.
 *
 * This module provides helpers that:
 *   1. Try sending with HTML parse mode (more forgiving)
 *   2. If that fails, fall back to plain text (no parse_mode)
 *
 * Use these everywhere instead of ctx.reply() / ctx.telegram.editMessageText()
 * to eliminate "can't parse entities at byte offset N" errors forever.
 */

/**
 * Escape HTML special characters for Telegram's HTML parse mode.
 * Only <, >, & need escaping in HTML mode.
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape MarkdownV2 special characters.
 * Use this ONLY when you actually want MarkdownV2 formatting.
 */
export function escapeMarkdownV2(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Send a message safely — tries HTML, falls back to plain text.
 *
 * @param {Object} ctx - Telegraf context
 * @param {string} text - message text
 * @param {Object} options - extra options (keyboard, etc.)
 * @param {boolean} asHtml - if true, parse as HTML; if false, plain text
 */
export async function tgReply(ctx, text, options = {}, asHtml = false) {
  const sendOpts = { ...options };
  if (asHtml) {
    sendOpts.parse_mode = 'HTML';
  } else {
    delete sendOpts.parse_mode;
  }

  try {
    return await ctx.reply(text, sendOpts);
  } catch (err) {
    // If HTML parse failed, retry as plain text
    if (asHtml && String(err.message).includes('parse')) {
      delete sendOpts.parse_mode;
      try {
        return await ctx.reply(text, sendOpts);
      } catch (e2) {
        // Last resort: send a generic message
        return await ctx.reply('⚠️ Message could not be displayed.');
      }
    }
    throw err;
  }
}

/**
 * Edit a message safely — tries HTML, falls back to plain text.
 *
 * @param {Object} ctx - Telegraf context
 * @param {number} chatId - chat ID
 * @param {number} messageId - message ID to edit
 * @param {string} text - new text
 * @param {Object} options - extra options
 * @param {boolean} asHtml - if true, parse as HTML
 */
export async function tgEditMessage(ctx, chatId, messageId, text, options = {}, asHtml = false) {
  const sendOpts = { ...options };
  if (asHtml) {
    sendOpts.parse_mode = 'HTML';
  } else {
    delete sendOpts.parse_mode;
  }

  try {
    return await ctx.telegram.editMessageText(chatId, messageId, null, text, sendOpts);
  } catch (err) {
    // "message is not modified" is harmless
    if (String(err.message).includes('not modified')) return null;

    // If HTML parse failed, retry as plain text
    if (asHtml && String(err.message).includes('parse')) {
      delete sendOpts.parse_mode;
      try {
        return await ctx.telegram.editMessageText(chatId, messageId, null, text, sendOpts);
      } catch (e2) {
        // If still fails (e.g. message too long), send as new reply
        if (String(e2.message).includes('too long') || String(e2.message).includes('MESSAGE_TOO_LONG')) {
          return await ctx.reply(text.substring(0, 4000));
        }
        return null;
      }
    }

    // If message is too long, split into chunks
    if (String(err.message).includes('too long') || String(err.message).includes('MESSAGE_TOO_LONG')) {
      const chunkSize = 4000;
      for (let i = 0; i < text.length; i += chunkSize) {
        await ctx.reply(text.substring(i, i + chunkSize));
      }
      return null;
    }

    return null;
  }
}

/**
 * Send a long message — auto-splits into chunks if > 4096 chars.
 * Tries HTML first, falls back to plain text per chunk.
 */
export async function tgSendLong(ctx, text, options = {}, asHtml = false) {
  const MAX = 4000;
  if (text.length <= MAX) {
    return await tgReply(ctx, text, options, asHtml);
  }

  // Split on paragraph boundaries if possible
  const chunks = [];
  let remaining = text;
  while (remaining.length > MAX) {
    let splitAt = remaining.lastIndexOf('\n\n', MAX);
    if (splitAt < 1000) splitAt = remaining.lastIndexOf('\n', MAX);
    if (splitAt < 1000) splitAt = MAX;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).replace(/^\n+/, '');
  }
  if (remaining.length > 0) chunks.push(remaining);

  const messages = [];
  for (const chunk of chunks) {
    messages.push(await tgReply(ctx, chunk, options, asHtml));
  }
  return messages;
}

export default { escapeHtml, escapeMarkdownV2, tgReply, tgEditMessage, tgSendLong };
