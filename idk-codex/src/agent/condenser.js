/**
 * MAX 2.0 — Context Condenser
 *
 * When conversation history gets too long for the model's context window,
 * this module summarizes older messages into a compact summary.
 * Inspired by OpenHands' LLMSummarizingCondenser.
 *
 * Strategy:
 *   1. Keep the system prompt + last N messages verbatim
 *   2. Summarize the older messages into a single "Previous context" message
 *   3. If the LLM is unavailable, truncate to the most recent messages
 */

import { generateCompletion } from '../groq/client.js';
import { estimateTokens } from '../context/context-manager.js';
import logger from '../utils/logger.js';

const DEFAULT_KEEP_RECENT = 10; // Keep last 10 messages verbatim
const DEFAULT_MAX_TOKENS = 8000; // Target max tokens for the condensed history

/**
 * Condense a conversation's message history to fit within a token budget.
 *
 * @param {Array} messages - Array of {role, content} objects
 * @param {Object} options - { maxTokens, keepRecent, budgetManager }
 * @returns {Promise<Array>} Condensed messages array
 */
export async function condenseMessages(messages, options = {}) {
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  const keepRecent = options.keepRecent || DEFAULT_KEEP_RECENT;

  if (!messages || messages.length === 0) return messages;

  // Calculate total tokens
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m?.content || ''), 0);

  if (totalTokens <= maxTokens) {
    return messages; // No condensation needed
  }

  logger.info('Condensing conversation history', {
    totalTokens,
    maxTokens,
    messageCount: messages.length,
    keepRecent
  });

  // Split into system messages, old messages (to summarize), and recent messages (to keep)
  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystemMessages = messages.filter(m => m.role !== 'system');

  if (nonSystemMessages.length <= keepRecent) {
    // Can't condense — just keep everything
    return messages;
  }

  const toSummarize = nonSystemMessages.slice(0, nonSystemMessages.length - keepRecent);
  const toKeep = nonSystemMessages.slice(nonSystemMessages.length - keepRecent);

  // Try to summarize the old messages
  let summary;
  try {
    summary = await summarizeMessages(toSummarize, options.budgetManager);
  } catch (err) {
    logger.warn('Failed to summarize messages, truncating instead', { error: err.message });
    // Fallback: just keep the recent messages + system
    return [...systemMessages, ...toKeep];
  }

  // Build the condensed history
  const condensed = [
    ...systemMessages,
    {
      role: 'system',
      content: `[Previous conversation summary]: ${summary}`
    },
    ...toKeep
  ];

  const condensedTokens = condensed.reduce((sum, m) => sum + estimateTokens(m?.content || ''), 0);
  logger.info('Conversation condensed', {
    originalTokens: totalTokens,
    condensedTokens,
    reduction: `${Math.round((1 - condensedTokens / totalTokens) * 100)}%`
  });

  return condensed;
}

/**
 * Summarize a list of messages using the LLM.
 */
async function summarizeMessages(messages, budgetManager) {
  const conversationText = messages.map(m => {
    const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'MAX' : 'System';
    return `${role}: ${m.content}`;
  }).join('\n\n');

  const prompt = `Summarize the following conversation history. Keep:
- Key decisions made
- Files created or modified
- Important tool results
- Any errors or issues encountered
- The current state of the task

Be concise but don't lose important details. Maximum 500 words.

Conversation to summarize:
${conversationText.substring(0, 10000)}`;

  const result = await generateCompletion([
    { role: 'system', content: 'You are a conversation summarizer. Be concise and preserve key information.' },
    { role: 'user', content: prompt }
  ], {
    temperature: 0.2,
    maxTokens: 800,
    budgetManager
  });

  return result?.content || 'Previous conversation was condensed.';
}

export default { condenseMessages, summarizeMessages };
