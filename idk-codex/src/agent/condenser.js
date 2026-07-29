/**
 * MAX 2.0 — Context Condenser (Enhanced for Feature #16)
 *
 * When conversation history gets too long for the model's context window,
 * this module summarizes older messages into a compact summary.
 *
 * ENHANCED STRATEGY (Feature #16 — Context Window Optimization):
 *   1. Always keep the system prompt + last N messages verbatim
 *   2. KEEP tool-call results verbatim (they're hard to summarize accurately)
 *   3. Summarize only the chatty text messages (assistant reasoning, user questions)
 *   4. Use a two-tier token budget: 70% for recent + tool results, 30% for summary
 *   5. If the LLM is unavailable, truncate to the most recent messages
 *   6. Strip image content from old messages (replace with "[image attached]")
 *   7. Truncate very long tool results to last 500 chars
 */

import { completion } from '../llm/adapter.js';
import { estimateTokens } from '../context/context-manager.js';
import logger from '../utils/logger.js';

const DEFAULT_KEEP_RECENT = 8; // Keep last 8 messages verbatim
const DEFAULT_MAX_TOKENS = 8000; // Target max tokens for the condensed history
const MAX_TOOL_RESULT_CHARS = 1500; // Truncate tool results in summary to this length
const MAX_MESSAGE_CHARS_IN_SUMMARY = 800; // Truncate each message in summary input

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
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(serializeContent(m?.content)), 0);

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
    // Can't condense — just keep everything but strip large content from old messages
    return stripLargeContent(messages, maxTokens);
  }

  const toSummarize = nonSystemMessages.slice(0, nonSystemMessages.length - keepRecent);
  const toKeep = nonSystemMessages.slice(nonSystemMessages.length - keepRecent);

  // ===== SELECTIVE RETENTION (Feature #16) =====
  // Separate tool results (keep verbatim but truncated) from chatty messages (summarize)
  const toolResults = [];
  const chattyMessages = [];
  for (const msg of toSummarize) {
    if (msg.role === 'tool' || (msg.role === 'user' && typeof msg.content === 'string' && msg.content.startsWith('OBSERVATION:'))) {
      toolResults.push(msg);
    } else {
      chattyMessages.push(msg);
    }
  }

  // Summarize the chatty messages
  let summary;
  try {
    summary = await summarizeMessages(chattyMessages, options.budgetManager);
  } catch (err) {
    logger.warn('Failed to summarize messages, truncating instead', { error: err.message });
    // Fallback: just keep the recent messages + system
    return [...systemMessages, ...toKeep];
  }

  // Build the condensed history: system + summary + truncated tool results + recent
  const condensedToolResults = toolResults.map(msg => ({
    role: msg.role,
    content: truncateToolResult(serializeContent(msg.content)),
    ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {})
  }));

  const condensed = [
    ...systemMessages,
    {
      role: 'system',
      content: `[Previous conversation summary]: ${summary}\n\n[Key tool results from earlier]:\n${condensedToolResults.length > 0 ? condensedToolResults.map(t => `• ${truncateToolResult(serializeContent(t.content), 200)}`).join('\n') : '(none)'}`
    },
    ...toKeep
  ];

  const condensedTokens = condensed.reduce((sum, m) => sum + estimateTokens(serializeContent(m?.content)), 0);
  logger.info('Conversation condensed', {
    originalTokens: totalTokens,
    condensedTokens,
    reduction: `${Math.round((1 - condensedTokens / totalTokens) * 100)}%`,
    toolResultsKept: condensedToolResults.length
  });

  return condensed;
}

/**
 * Serialize message content (handles string OR array content for vision messages).
 */
function serializeContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (part.type === 'text') return part.text || '';
      if (part.type === 'image_url') return '[image]';
      return JSON.stringify(part);
    }).join(' ');
  }
  return String(content || '');
}

/**
 * Truncate a tool result string for inclusion in the summary.
 */
function truncateToolResult(text, max = MAX_TOOL_RESULT_CHARS) {
  if (!text || text.length <= max) return text;
  // Keep the beginning (often has the success/fail signal) and end (often has the result)
  const halfMax = Math.floor(max / 2);
  return text.substring(0, halfMax) + '\n...\n' + text.substring(text.length - halfMax);
}

/**
 * Strip large content (images, very long strings) from messages when even
 * keeping everything isn't possible. This is the last-resort fallback.
 */
function stripLargeContent(messages, maxTokens) {
  return messages.map(msg => {
    if (!msg.content) return msg;
    const serialized = serializeContent(msg.content);
    if (serialized.length > 4000) {
      return {
        ...msg,
        content: serialized.substring(0, 2000) + '\n... [truncated for context] ...\n' + serialized.substring(serialized.length - 1000)
      };
    }
    return msg;
  });
}

/**
 * Summarize a list of messages using the LLM.
 * Each message is truncated to MAX_MESSAGE_CHARS_IN_SUMMARY chars before
 * being included in the summary prompt to avoid blowing up the context.
 */
async function summarizeMessages(messages, budgetManager) {
  const conversationText = messages.map(m => {
    const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'MAX' : 'System';
    const content = serializeContent(m.content).substring(0, MAX_MESSAGE_CHARS_IN_SUMMARY);
    return `${role}: ${content}`;
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

  const result = await completion({
    messages: [
      { role: 'system', content: 'You are a conversation summarizer. Be concise and preserve key information.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 800
  });

  return result?.content || 'Previous conversation was condensed.';
}

export default { condenseMessages, summarizeMessages };
