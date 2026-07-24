import logger from '../utils/logger.js';

const AUTHORIZED_USER_ID = parseInt(process.env.AUTHORIZED_USER_ID || '0', 10);

/**
 * Authentication middleware - only allow authorized user
 * @param {Object} ctx - Telegraf context
 * @param {Function} next - Next middleware function
 */
export async function authMiddleware(ctx, next) {
  const userId = ctx.from?.id;

  if (!userId) {
    logger.warn('Request without user ID');
    return;
  }

  if (AUTHORIZED_USER_ID === 0) {
    logger.error('AUTHORIZED_USER_ID not configured');
    await ctx.reply('⚠️ Bot not configured. Please set AUTHORIZED_USER_ID environment variable.');
    return;
  }

  if (userId !== AUTHORIZED_USER_ID) {
    logger.warn('Unauthorized access attempt', { userId, authorizedId: AUTHORIZED_USER_ID });
    await ctx.reply('⛔ Unauthorized. This bot is private.');
    return;
  }

  logger.logTelegram('incoming', userId, ctx.message?.text);
  await next();
}

/**
 * Error handling middleware
 * @param {Error} error - Error object
 * @param {Object} ctx - Telegraf context
 */
export async function errorMiddleware(error, ctx) {
  logger.error('Telegram bot error', {
    error: error.message,
    userId: ctx.from?.id,
    update: ctx.update
  });

  try {
    await ctx.reply('❌ An error occurred while processing your request. Please try again.');
  } catch (replyError) {
    logger.error('Failed to send error message', { error: replyError.message });
  }
}

/**
 * Logging middleware
 * @param {Object} ctx - Telegraf context
 * @param {Function} next - Next middleware function
 */
export async function loggingMiddleware(ctx, next) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  logger.debug('Request processed', {
    userId: ctx.from?.id,
    command: ctx.message?.text?.split(' ')[0],
    duration: ms
  });
}

export default {
  authMiddleware,
  errorMiddleware,
  loggingMiddleware
};
