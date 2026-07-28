/**
 * Long-term Memory Summarization (Feature #23)
 *
 * Periodically summarizes old conversations into compact memory entries
 * that survive across sessions. This gives MAX persistent recall without
 * storing every message forever.
 *
 * Two layers:
 *   1. Short-term: recent conversation messages (current session)
 *   2. Long-term: summarized facts stored in max_memory (cross-session)
 *
 * The summarizer runs:
 *   - When a conversation hits 30+ messages
 *   - When a user starts a new session (load relevant long-term memories)
 *   - On a periodic schedule (every hour for active users)
 *
 * POST /api/memory/summarize/:conversationId — manually trigger summarization
 * GET  /api/memory/long-term                — get long-term memories
 */

import express from 'express';
import { optionalAuth } from '../../auth/middleware.js';
import { getDatabase } from '../../database/db.js';
import { generateCompletion } from '../../groq/client.js';
import { addConversationMessage, getConversation } from '../../database/conversations-supabase.js';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(optionalAuth);

/**
 * Summarize a conversation into 3-5 key facts and save them as long-term memories.
 *
 * @param {string} userId
 * @param {string} conversationId
 */
export async function summarizeConversationToMemory(userId, conversationId) {
  try {
    const conv = await getConversation(conversationId, userId);
    if (!conv || !conv.messages || conv.messages.length < 10) {
      return { success: false, reason: 'Conversation too short to summarize' };
    }

    // Build a transcript of the conversation
    const transcript = conv.messages
      .map(m => `${m.role === 'user' ? 'User' : 'MAX'}: ${m.content}`)
      .join('\n\n')
      .substring(0, 12000);  // cap to avoid blowing context

    // Ask LLM to extract 3-5 key facts worth remembering
    const prompt = `Extract 3-5 key facts from this conversation that would be useful to remember in future conversations with this user. Focus on:
- User preferences and goals
- Important decisions made
- Files created or projects started
- Recurring topics or pain points

Output as JSON: { "facts": [{ "key": "short_key", "value": "fact text" }] }

Conversation:
${transcript}`;

    const result = await generateCompletion([
      { role: 'system', content: 'You are a memory extraction agent. Output valid JSON only.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.2, maxTokens: 600 });

    if (!result?.content) return { success: false, reason: 'LLM returned no content' };

    // Parse the JSON response
    let facts;
    try {
      // Strip markdown code fences if present
      const cleaned = result.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      facts = JSON.parse(cleaned);
    } catch (e) {
      logger.warn('Memory summarization JSON parse failed', { error: e.message, content: result.content.substring(0, 200) });
      return { success: false, reason: 'Failed to parse LLM response' };
    }

    if (!facts.facts || !Array.isArray(facts.facts)) {
      return { success: false, reason: 'No facts in response' };
    }

    // Save each fact as a long-term memory
    const db = getDatabase();
    db.prepare(`CREATE TABLE IF NOT EXISTS max_memory (
      user_id TEXT,
      key TEXT,
      value TEXT,
      tags TEXT,
      source TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key)
    )`).run();

    let saved = 0;
    for (const fact of facts.facts) {
      if (!fact.key || !fact.value) continue;
      try {
        db.prepare(`
          INSERT OR REPLACE INTO max_memory (user_id, key, value, tags, source, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(userId, fact.key, fact.value, 'long-term', `conversation:${conversationId}`);
        saved++;
      } catch (e) { /* skip dupes */ }
    }

    logger.info('Conversation summarized to memory', { userId, conversationId, factsSaved: saved });
    return { success: true, factsSaved: saved, facts: facts.facts };
  } catch (e) {
    logger.error('Memory summarization failed', { error: e.message });
    return { success: false, reason: e.message };
  }
}

/**
 * Get long-term memories for a user.
 * Returns key facts that were extracted from past conversations.
 */
export function getLongTermMemories(userId, limit = 20) {
  try {
    const db = getDatabase();
    db.prepare(`CREATE TABLE IF NOT EXISTS max_memory (
      user_id TEXT,
      key TEXT,
      value TEXT,
      tags TEXT,
      source TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key)
    )`).run();

    return db.prepare(`
      SELECT key, value, tags, source, created_at
      FROM max_memory
      WHERE user_id = ? AND (tags LIKE '%long-term%' OR source LIKE 'conversation:%')
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);
  } catch (e) {
    return [];
  }
}

// ============================================================================
// ROUTES
// ============================================================================

router.post('/summarize/:conversationId', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await summarizeConversationToMemory(userId, req.params.conversationId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/long-term', (req, res) => {
  try {
    const userId = req.user.id;
    const memories = getLongTermMemories(userId);
    res.json({ success: true, memories });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
