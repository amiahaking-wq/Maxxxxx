import { Telegraf } from 'telegraf';
import { handleTelegramMessage, handleTelegramCallback } from './telegram-handler.js';
import logger from '../utils/logger.js';

/**
 * Initialize Telegram bot with new handler
 * @returns {Telegraf} Bot instance
 */
export function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
  }

  // Telemetry logging for token verification
  logger.info('Initializing Telegram bot', {
    tokenPrefix: token?.substring(0, 5),
    tokenLength: token?.length
  });

  const bot = new Telegraf(token);

  // Log all updates for debugging
  bot.use((ctx, next) => {
    logger.debug('Telegram update received', {
      updateType: ctx.updateType,
      chatId: ctx.chat?.id,
      userId: ctx.from?.id
    });
    return next();
  });

  // Handle all messages (commands and text) with unified handler
  bot.on('message', handleTelegramMessage);

  // Handle callback queries (inline keyboard responses)
  bot.on('callback_query', handleTelegramCallback);

  // Error handler
  bot.catch((err, ctx) => {
    logger.error('Telegram bot error', {
      error: err.message,
      stack: err.stack,
      updateType: ctx.updateType
    });

    // Try to notify user
    if (ctx.reply) {
      ctx.reply('❌ An error occurred. Please try again.').catch(() => {});
    }
  });

  logger.info('Telegram bot initialized with new handler');

  return bot;
}

/**
 * Start bot in polling mode
 * @param {Telegraf} bot - Bot instance
 * @param {object} options - Start options
 * @returns {object} Result with success status
 */
export async function startBot(bot, options = {}) {
  try {
    logger.info('Starting Telegram bot in polling mode');

    const { retryDelay = 0 } = options;

    if (retryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: ['message', 'callback_query']
    });

    logger.info('✅ Telegram bot started successfully (polling mode)');

    return { success: true, mode: 'polling' };

  } catch (error) {
    logger.error('Failed to start Telegram bot', {
      error: error.message,
      code: error.code,
      response: error.response?.description
    });

    // Determine if error is retryable
    const retryableErrors = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN'];
    const isRetryable = retryableErrors.includes(error.code) ||
                       error.message.includes('network') ||
                       error.message.includes('timeout');

    return {
      success: false,
      error,
      retryable: isRetryable,
      code: error.code
    };
  }
}

/**
 * Start bot in webhook mode
 * @param {Telegraf} bot - Bot instance
 * @param {object} options - Webhook options
 * @returns {object} Result with success status
 */
export async function startBotWebhook(bot, options = {}) {
  try {
    logger.info('Starting Telegram bot in webhook mode', options);

    const { webhookUrl, path = '/api/telegram/webhook', port } = options;

    if (!webhookUrl) {
      throw new Error('Webhook URL is required for webhook mode');
    }

    // Set webhook
    await bot.telegram.setWebhook(`${webhookUrl}${path}`);

    logger.info('✅ Telegram bot webhook set successfully', {
      url: `${webhookUrl}${path}`
    });

    return { success: true, mode: 'webhook' };

  } catch (error) {
    logger.error('Failed to set Telegram webhook', {
      error: error.message,
      code: error.code
    });

    return {
      success: false,
      error,
      retryable: false,
      code: error.code
    };
  }
}

export default {
  initBot,
  startBot,
  startBotWebhook
};
