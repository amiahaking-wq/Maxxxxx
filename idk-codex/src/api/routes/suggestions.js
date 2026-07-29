/**
 * Proactive Suggestions (Feature #24)
 *
 * Generates helpful suggestions for the user based on:
 *   - Their recent activity (conversations, files created)
 *   - Their long-term memories (preferences, goals)
 *   - Current time of day / day of week
 *   - Common patterns (e.g. "Continue working on X")
 *
 * GET /api/suggestions — get 3-5 proactive suggestions for the user
 *
 * Suggestions look like:
 *   - "Continue working on your snake game from yesterday"
 *   - "You have 3 unresolved GitHub issues. Want me to review them?"
 *   - "It's been a week since you worked on the landing page. Pick it back up?"
 *   - "Try asking me: 'Build a pricing page for my SaaS'"
 */

import express from 'express';
import { optionalAuth } from '../../auth/middleware.js';
import { getDatabase } from '../../database/db.js';
import { getLongTermMemories } from './memory-long-term.js';
import { listConversations } from '../../database/conversations-supabase.js';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(optionalAuth);

/**
 * Generate proactive suggestions for the user.
 */
async function generateSuggestions(userId) {
  const suggestions = [];

  try {
    // ===== SUGGESTION TYPE 1: Continue recent work =====
    const conversations = await listConversations(userId, 5);
    const recent = conversations.filter(c => {
      const updated = new Date(c.updatedAt || c.created_at || 0);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return updated > dayAgo;
    });
    for (const conv of recent.slice(0, 2)) {
      if (conv.title && conv.title !== 'New Conversation' && conv.title !== 'Telegram Chat') {
        suggestions.push({
          type: 'continue',
          icon: '🔄',
          title: `Continue: ${conv.title}`,
          prompt: `Let's continue working on ${conv.title}`,
          conversationId: conv.id
        });
      }
    }

    // ===== SUGGESTION TYPE 2: Based on long-term memories =====
    const memories = getLongTermMemories(userId, 5);
    for (const mem of memories.slice(0, 2)) {
      if (mem.value && mem.value.length < 100) {
        suggestions.push({
          type: 'memory',
          icon: '🧠',
          title: `You mentioned: ${mem.value}`,
          prompt: `Tell me more about ${mem.value}`
        });
      }
    }
  } catch (e) {
    logger.warn('Suggestion generation failed', { error: e.message });
  }

  // ===== SUGGESTION TYPE 3: Time-based suggestions =====
  const hour = new Date().getHours();
  let timeSuggestion = null;
  if (hour < 12) {
    timeSuggestion = {
      type: 'time',
      icon: '☀️',
      title: 'Start your day with a fresh build',
      prompt: 'Build me a simple HTML dashboard I can use today'
    };
  } else if (hour < 18) {
    timeSuggestion = {
      type: 'time',
      icon: '🚀',
      title: 'Afternoon coding session?',
      prompt: 'What should I work on next? Suggest a small project.'
    };
  } else {
    timeSuggestion = {
      type: 'time',
      icon: '🌙',
      title: 'Evening wind-down',
      prompt: 'Show me a relaxing JavaScript animation'
    };
  }
  suggestions.push(timeSuggestion);

  // ===== SUGGESTION TYPE 4: Always-on starter suggestions =====
  if (suggestions.length < 4) {
    suggestions.push({
      type: 'starter',
      icon: '🎮',
      title: 'Build a game',
      prompt: 'Build a snake game in HTML'
    });
    suggestions.push({
      type: 'starter',
      icon: '🔍',
      title: 'Search the web',
      prompt: 'Search for the latest AI news'
    });
  }

  return suggestions.slice(0, 5);
}

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const suggestions = await generateSuggestions(userId);
    res.json({ success: true, suggestions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
export { generateSuggestions };
