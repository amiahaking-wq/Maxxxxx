import { promises as fs } from 'fs';
import { join } from 'path';
import { getRecentMessages, addMessage } from '../database/queries.js';
import logger from '../utils/logger.js';

const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';
const MAX_CONTEXT_MESSAGES = 10; // Keep last 10 messages in context

/**
 * Ensure sessions directory exists
 */
async function ensureSessionsDir() {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create sessions directory', { error: error.message });
  }
}

/**
 * Get context for an agent session
 * @param {number} sessionId - Session ID
 * @returns {Promise<Array>} Array of context messages
 */
export async function getContext(sessionId) {
  try {
    // Get recent messages from database
    const messages = await getRecentMessages(sessionId, MAX_CONTEXT_MESSAGES);

    // Convert to Groq format
    const context = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    logger.debug('Retrieved context', { sessionId, messageCount: context.length });
    return context;
  } catch (error) {
    logger.error('Failed to get context', { sessionId, error: error.message });
    return [];
  }
}

/**
 * Add message to context
 * @param {number} sessionId - Session ID
 * @param {string} role - Message role (user, assistant, system)
 * @param {string} content - Message content
 * @returns {Promise<number>} Message ID
 */
export async function addToContext(sessionId, role, content) {
  try {
    const messageId = addMessage(sessionId, role, content);

    // Also save to JSON backup file
    await saveContextBackup(sessionId);

    logger.debug('Added to context', { sessionId, role, contentLength: content.length });
    return messageId;
  } catch (error) {
    logger.error('Failed to add to context', { sessionId, role, error: error.message });
    throw error;
  }
}

/**
 * Save context backup to JSON file
 * @param {number} sessionId - Session ID
 */
async function saveContextBackup(sessionId) {
  try {
    await ensureSessionsDir();

    const context = await getContext(sessionId);
    const filePath = join(SESSIONS_DIR, `session-${sessionId}.json`);

    await fs.writeFile(filePath, JSON.stringify({
      sessionId,
      timestamp: new Date().toISOString(),
      messages: context
    }, null, 2));

    logger.debug('Saved context backup', { sessionId, filePath });
  } catch (error) {
    logger.warn('Failed to save context backup', { sessionId, error: error.message });
    // Don't throw - backup is optional
  }
}

/**
 * Load context backup from JSON file
 * @param {number} sessionId - Session ID
 * @returns {Promise<Array|null>} Array of messages or null
 */
export async function loadContextBackup(sessionId) {
  try {
    const filePath = join(SESSIONS_DIR, `session-${sessionId}.json`);
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data);

    logger.info('Loaded context backup', { sessionId, messageCount: parsed.messages.length });
    return parsed.messages;
  } catch (error) {
    logger.debug('No context backup found', { sessionId });
    return null;
  }
}

/**
 * Clear context for a session
 * @param {number} sessionId - Session ID
 */
export async function clearContext(sessionId) {
  try {
    // Note: We don't delete from database (for audit trail)
    // Just delete the backup file
    const filePath = join(SESSIONS_DIR, `session-${sessionId}.json`);
    await fs.unlink(filePath);

    logger.info('Cleared context backup', { sessionId });
  } catch (error) {
    logger.warn('Failed to clear context backup', { sessionId, error: error.message });
  }
}

/**
 * Build enriched context with repository information
 * @param {number} sessionId - Session ID
 * @param {Object} repoInfo - Repository information
 * @returns {Promise<Array>} Enriched context
 */
export async function buildEnrichedContext(sessionId, repoInfo = null) {
  const context = await getContext(sessionId);

  if (repoInfo) {
    // Add repository context as system message if not already present
    const hasRepoContext = context.some(msg =>
      msg.role === 'system' && typeof msg.content === 'string' && msg.content.includes('Repository:')
    );

    if (!hasRepoContext && context.length > 0) {
      const repoContext = {
        role: 'system',
        content: `Repository: ${repoInfo.owner}/${repoInfo.name}\nBranch: ${repoInfo.branch || 'main'}\nFiles: ${repoInfo.fileCount || 'unknown'}`
      };

      // Insert after first system message or at beginning
      const firstSystemIndex = context.findIndex(msg => msg.role === 'system');
      if (firstSystemIndex >= 0) {
        context.splice(firstSystemIndex + 1, 0, repoContext);
      } else {
        context.unshift(repoContext);
      }
    }
  }

  return context;
}

/**
 * V2 Enhancement: Estimate token count for messages
 * Uses a simple heuristic: ~4 characters per token
 * @param {Array} messages - Array of messages
 * @returns {number} Estimated token count
 */
export function estimateTokenCount(messages) {
  if (!messages || messages.length === 0) {
    return 0;
  }

  const totalChars = messages.reduce((sum, msg) => {
    return sum + (msg.content?.length || 0);
  }, 0);

  // Rough estimate: 4 characters ≈ 1 token
  const estimatedTokens = Math.ceil(totalChars / 4);

  logger.debug('Estimated token count', {
    messageCount: messages.length,
    totalChars,
    estimatedTokens
  });

  return estimatedTokens;
}

/**
 * Summarize context to reduce token usage
 * V2 Enhancement: Uses token-based truncation instead of message count
 * @param {Array} context - Context messages
 * @param {number} maxMessages - Maximum messages to keep (legacy)
 * @param {number} maxTokens - Maximum tokens to keep (V2)
 * @returns {Array} Summarized context
 */
export function summarizeContext(context, maxMessages = MAX_CONTEXT_MESSAGES, maxTokens = null) {
  if (!context || context.length === 0) {
    return context;
  }

  // V2: If maxTokens specified, use token-based truncation
  if (maxTokens) {
    const systemMessages = context.filter(msg => msg.role === 'system');
    const nonSystemMessages = context.filter(msg => msg.role !== 'system');

    // Always keep system messages
    let result = [...systemMessages];
    let currentTokens = estimateTokenCount(systemMessages);

    // Add messages from most recent, working backwards
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      const msgTokens = estimateTokenCount([msg]);

      if (currentTokens + msgTokens <= maxTokens) {
        result.push(msg);
        currentTokens += msgTokens;
      } else {
        logger.info('Context truncated by token budget', {
          messagesKept: result.length,
          messagesDropped: i + 1,
          estimatedTokens: currentTokens
        });
        break;
      }
    }

    // Restore chronological order
    return [
      ...systemMessages,
      ...result.filter(msg => msg.role !== 'system').reverse()
    ];
  }

  // Legacy: Message count-based truncation
  if (context.length <= maxMessages) {
    return context;
  }

  // Keep first system message and last N messages
  const systemMessages = context.filter(msg => msg.role === 'system');
  const nonSystemMessages = context.filter(msg => msg.role !== 'system');

  const recentMessages = nonSystemMessages.slice(-maxMessages);

  return [
    ...systemMessages.slice(0, 1), // Keep first system message
    ...recentMessages
  ];
}

export default {
  getContext,
  addToContext,
  loadContextBackup,
  clearContext,
  buildEnrichedContext,
  summarizeContext,
  estimateTokenCount, // V2 enhancement
  MAX_CONTEXT_MESSAGES
};
