/**
 * Personality Engine (Phase 4.2)
 *
 * Learns the user's communication style from interactions and provides
 * a system prompt addon that nudges the agent to match the user's style.
 *
 * Style preferences tracked:
 *   - communication_style: 'concise' | 'balanced' | 'detailed'
 *   - tone: 'casual' | 'professional' | 'friendly'
 *   - formality: 'formal' | 'informal'
 *   - emoji_usage: 'none' | 'occasional' | 'frequent'
 *
 * Backed by a SQLite table `max_user_profile` so it persists across restarts.
 */

import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';

let _tableEnsured = false;

function getDB() {
  try { return getDatabase(); } catch { return null; }
}

function ensureTable() {
  if (_tableEnsured) return;
  const db = getDB();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS max_user_profile (
        user_id TEXT PRIMARY KEY,
        communication_style TEXT DEFAULT 'balanced',
        tone TEXT DEFAULT 'friendly',
        formality TEXT DEFAULT 'informal',
        emoji_usage TEXT DEFAULT 'occasional',
        avg_message_length REAL DEFAULT 0,
        avg_response_length REAL DEFAULT 0,
        interaction_count INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);
    _tableEnsured = true;
  } catch (e) {
    logger.debug('max_user_profile table creation skipped', { error: e.message });
  }
}

/**
 * Heuristic: classify a message as concise / balanced / detailed.
 * < 60 chars => concise
 * 60-300 chars => balanced
 * > 300 chars => detailed
 */
function classifyLength(text) {
  if (!text) return 'balanced';
  const len = String(text).trim().length;
  if (len < 60) return 'concise';
  if (len > 300) return 'detailed';
  return 'balanced';
}

function classifyTone(text) {
  if (!text) return 'friendly';
  const lower = String(text).toLowerCase();
  // Casual markers: slang, abbreviations, no caps
  const casualMarkers = /\b(yeah|nope|ok|gonna|wanna|kinda|lol|haha|btw|tbh|imo|smh)\b/;
  // Formal markers: sir, ma'am, formal phrasing
  const formalMarkers = /\b(therefore|however|furthermore|nevertheless|regarding|accordingly)\b/;
  if (formalMarkers.test(lower)) return 'professional';
  if (casualMarkers.test(lower)) return 'casual';
  return 'friendly';
}

function classifyFormality(text) {
  if (!text) return 'informal';
  const lower = String(text).toLowerCase();
  // Informal: contractions, lowercase start, slang
  const informal = /\b(i'm|i'll|don't|can't|won't|isn't|let's|that's)\b/;
  const formal = /\b(i am|i will|do not|cannot|will not|is not|let us|that is)\b/;
  if (formal.test(lower)) return 'formal';
  if (informal.test(lower)) return 'informal';
  return 'informal';
}

function classifyEmojiUsage(text) {
  if (!text) return 'occasional';
  const emojiCount = (String(text).match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  if (emojiCount === 0) return 'none';
  if (emojiCount >= 3) return 'frequent';
  return 'occasional';
}

export class PersonalityEngine {
  constructor() {
    ensureTable();
  }

  /**
   * Get the user's profile, creating one with defaults if needed.
   */
  getProfile(userId = 'default-user') {
    const db = getDB();
    if (!db) return null;
    try {
      let row = db.prepare('SELECT * FROM max_user_profile WHERE user_id = ?').get(userId);
      if (!row) {
        db.prepare(`
          INSERT INTO max_user_profile (user_id) VALUES (?)
          ON CONFLICT(user_id) DO NOTHING
        `).run(userId);
        row = db.prepare('SELECT * FROM max_user_profile WHERE user_id = ?').get(userId);
      }
      return row;
    } catch (e) {
      logger.debug('getProfile failed', { error: e.message });
      return null;
    }
  }

  /**
   * Learn from an interaction (user message + agent response).
   * Updates the profile with rolling averages and re-classified styles.
   */
  learnFromInteraction(userId, userMessage, agentResponse) {
    const db = getDB();
    if (!db || !userMessage) return;
    try {
      const profile = this.getProfile(userId) || {
        communication_style: 'balanced',
        tone: 'friendly',
        formality: 'informal',
        emoji_usage: 'occasional',
        avg_message_length: 0,
        avg_response_length: 0,
        interaction_count: 0
      };

      const msgLen = String(userMessage).length;
      const respLen = String(agentResponse || '').length;
      const count = (profile.interaction_count || 0) + 1;

      // Rolling average of message + response lengths
      const newAvgMsgLen = ((profile.avg_message_length || 0) * (count - 1) + msgLen) / count;
      const newAvgRespLen = ((profile.avg_response_length || 0) * (count - 1) + respLen) / count;

      // Re-classify based on the most recent message (with some momentum)
      // by blending the new classification with the existing profile.
      const newStyle = classifyLength(userMessage);
      const newTone = classifyTone(userMessage);
      const newFormality = classifyFormality(userMessage);
      const newEmoji = classifyEmojiUsage(userMessage);

      db.prepare(`
        UPDATE max_user_profile
        SET communication_style = ?,
            tone = ?,
            formality = ?,
            emoji_usage = ?,
            avg_message_length = ?,
            avg_response_length = ?,
            interaction_count = ?,
            updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        newStyle,
        newTone,
        newFormality,
        newEmoji,
        newAvgMsgLen,
        newAvgRespLen,
        count,
        userId
      );
    } catch (e) {
      logger.debug('learnFromInteraction failed', { error: e.message });
    }
  }

  /**
   * Get a system prompt addon that describes the user's preferred style.
   * Returns an empty string if no profile is available.
   */
  getSystemPromptAddon(userId = 'default-user') {
    const profile = this.getProfile(userId);
    if (!profile) return '';

    const style = profile.communication_style || 'balanced';
    const tone = profile.tone || 'friendly';
    const formality = profile.formality || 'informal';
    const emoji = profile.emoji_usage || 'occasional';

    const lines = [
      '\n===== USER COMMUNICATION PREFERENCES (learned) ====='
    ];

    if (style === 'concise') {
      lines.push('- Keep responses SHORT and to the point. Avoid filler.');
    } else if (style === 'detailed') {
      lines.push('- Provide DETAILED, thorough responses with explanations.');
    } else {
      lines.push('- Use a BALANCED response length — neither too short nor too long.');
    }

    if (tone === 'casual') {
      lines.push('- Use a CASUAL, conversational tone.');
    } else if (tone === 'professional') {
      lines.push('- Use a PROFESSIONAL, business-like tone.');
    } else {
      lines.push('- Use a FRIENDLY, approachable tone.');
    }

    if (formality === 'formal') {
      lines.push('- Use FORMAL language (avoid contractions).');
    } else {
      lines.push('- Use INFORMAL language (contractions are fine).');
    }

    if (emoji === 'none') {
      lines.push('- Do NOT use emojis.');
    } else if (emoji === 'frequent') {
      lines.push('- Use emojis FREQUENTLY to add personality.');
    } else {
      lines.push('- Use emojis OCCASIONALLY (1-2 per response max).');
    }

    lines.push('===== END USER PREFERENCES =====\n');
    return lines.join('\n');
  }
}

export default PersonalityEngine;
