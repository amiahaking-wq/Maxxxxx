/**
 * Customer Service Agent — Stage 8B
 *
 * MAX becomes a customer service agent for any business. Each business
 * gets its own profile (agent name, personality, escalation contact)
 * and knowledge base (policies, products, FAQs).
 *
 * Flow:
 *   1. Customer sends message to the business's Telegram bot
 *   2. Bot forwards message to POST /api/cs/message
 *   3. CustomerServiceAgent.handleMessage() is called
 *   4. Agent searches the business's knowledge base (RAG)
 *   5. Agent generates a response using the business's profile
 *   6. If escalation triggers (angry customer, refund request, etc.),
 *      the business owner is notified via Telegram
 *   7. Conversation history is saved for follow-up
 */

import { getDatabase } from '../database/db.js';
import { knowledgeStore } from '../rag/knowledge-store.js';
import { generateCompletion } from '../groq/client.js';
import logger from '../utils/logger.js';

// ============================================================================
// ESCALATION TRIGGERS
// ============================================================================

const ESCALATION_TRIGGERS = [
  'refund', 'sue', 'lawyer', 'fraud', 'scam',
  'never again', 'report', 'very angry', 'furious',
  'compensation', 'cancel my account', 'delete my data',
  'manager', 'supervisor', 'better business bureau',
  'attorney general', 'consumer protection'
];

// ============================================================================
// CUSTOMER SERVICE AGENT
// ============================================================================

export class CustomerServiceAgent {
  /**
   * @param {string} businessOwnerId - the user_id of the business owner
   * @param {Object} businessProfile - row from max_business_profiles
   */
  constructor(businessOwnerId, businessProfile) {
    this.ownerId = businessOwnerId;
    this.profile = businessProfile;
  }

  /**
   * Build a system prompt tailored to this specific business.
   */
  buildSystemPrompt() {
    return `You are ${this.profile.agent_name || 'MAX'}, the customer service assistant for ${this.profile.business_name}.

Your personality: ${this.profile.agent_personality || 'friendly, professional, helpful'}
Language: ${this.profile.language || 'English'}
Business type: ${this.profile.business_type || 'general'}

RULES:
1. Only answer questions about ${this.profile.business_name}. If asked about other businesses, politely redirect.
2. Always search the knowledge base before answering questions about products, prices, policies, or procedures.
3. If you don't know the answer, say so honestly and offer to escalate to a human.
4. Never make up prices, policies, or product details you're unsure about.
5. If a customer is angry or upset, acknowledge their frustration first before solving the problem.
6. If the issue cannot be resolved (refund request, serious complaint), escalate to: ${this.profile.escalation_contact || 'the business owner'}.
7. Working hours: ${this.profile.working_hours || 'not specified'}. If outside working hours, let the customer know when you'll follow up.
8. Always be ${this.profile.agent_personality || 'friendly and professional'}.
9. Keep responses concise — 3-5 sentences max unless the customer asks for detail.
10. Never share internal business information or other customers' data.`;
  }

  /**
   * Handle an incoming customer message.
   * @param {string} customerId - unique identifier (Telegram ID, email, etc.)
   * @param {string} customerName - display name
   * @param {string} message - the customer's message
   * @param {string} channel - 'telegram', 'web', 'whatsapp', etc.
   * @returns {Promise<Object>} { reply, escalated, conversationSaved }
   */
  async handleMessage(customerId, customerName, message, channel = 'telegram') {
    const db = getDatabase();

    // 1. Get or create conversation history
    let conv = null;
    try {
      conv = db.prepare(`
        SELECT * FROM max_customer_conversations
        WHERE user_id = ? AND customer_identifier = ?
        ORDER BY updated_at DESC LIMIT 1
      `).get(this.ownerId, customerId);
    } catch (e) {
      logger.warn('Failed to load customer conversation', { error: e.message });
    }

    let history = [];
    if (conv && conv.conversation_history) {
      try { history = JSON.parse(conv.conversation_history); } catch (e) { history = []; }
    }

    // 2. Search knowledge base for relevant context
    let context = '';
    try {
      const relevantDocs = await knowledgeStore.search(this.ownerId, message, 3);
      context = knowledgeStore.formatAsContext(relevantDocs);
    } catch (e) {
      // RAG not available — continue without context
      logger.debug('RAG unavailable for CS agent', { error: e.message });
    }

    // 3. Build messages for LLM
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() + context },
      ...history.slice(-10), // last 10 messages for context
      { role: 'user', content: `Customer (${customerName || 'Anonymous'}): ${message}` }
    ];

    // 4. Generate response
    let reply;
    try {
      // Disable Echo for CS responses
      const prevEcho = process.env.ECHO_PROVIDER_ENABLED;
      process.env.ECHO_PROVIDER_ENABLED = 'false';
      const result = await generateCompletion(messages, {
        temperature: 0.7,
        maxTokens: 500
      });
      process.env.ECHO_PROVIDER_ENABLED = prevEcho;
      reply = result?.content || "I'm sorry, I couldn't process your message. Please try again.";
    } catch (err) {
      logger.error('CS agent LLM call failed', { error: err.message });
      reply = `I'm having trouble responding right now. Please contact ${this.profile.escalation_contact || 'the business owner'} directly.`;
    }

    // 5. Detect if escalation is needed
    const needsEscalation = this.detectEscalation(message, reply);

    // 6. Save conversation history
    history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    history.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });

    // Keep history to last 50 messages to avoid bloat
    if (history.length > 50) history = history.slice(-50);

    try {
      if (conv) {
        // Update existing conversation
        db.prepare(`
          UPDATE max_customer_conversations
          SET conversation_history = ?, sentiment = ?, escalated = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          JSON.stringify(history),
          this.detectSentiment(message),
          needsEscalation ? 1 : 0,
          conv.id
        );
      } else {
        // Create new conversation
        db.prepare(`
          INSERT INTO max_customer_conversations
          (user_id, business_id, customer_identifier, customer_name, channel,
           conversation_history, sentiment, escalated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.ownerId,
          this.profile.id || null,
          customerId,
          customerName || null,
          channel,
          JSON.stringify(history),
          this.detectSentiment(message),
          needsEscalation ? 1 : 0
        );
      }
    } catch (e) {
      logger.error('Failed to save CS conversation', { error: e.message });
    }

    // 7. Notify business owner if escalation needed
    if (needsEscalation && this.profile.telegram_notify_id) {
      await this.notifyOwner(customerName, message, reply);
    }

    logger.info('CS message handled', {
      business: this.profile.business_name,
      customer: customerName,
      escalated: needsEscalation,
      replyLength: reply.length
    });

    return { reply, escalated: needsEscalation, conversationSaved: true };
  }

  /**
   * Detect if a message/reply warrants escalation.
   */
  detectEscalation(message, reply) {
    const combined = (message + ' ' + reply).toLowerCase();
    return ESCALATION_TRIGGERS.some(trigger => combined.includes(trigger));
  }

  /**
   * Simple sentiment detection (positive/neutral/negative).
   */
  detectSentiment(message) {
    const lower = (message || '').toLowerCase();
    const negative = ['angry', 'furious', 'terrible', 'awful', 'horrible', 'worst', 'hate', 'disgusted', 'unacceptable', 'disappointed', 'frustrated'];
    const positive = ['great', 'awesome', 'love', 'excellent', 'amazing', 'wonderful', 'perfect', 'fantastic', 'happy', 'pleased'];
    if (negative.some(w => lower.includes(w))) return 'negative';
    if (positive.some(w => lower.includes(w))) return 'positive';
    return 'neutral';
  }

  /**
   * Send a Telegram notification to the business owner about an escalation.
   */
  async notifyOwner(customerName, message, reply) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = this.profile.telegram_notify_id;
    if (!token || !chatId) return;

    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `⚠️ ESCALATION NEEDED\n\nCustomer: ${customerName || 'Unknown'}\nMessage: ${message}\n\nMAX replied: ${reply}\n\nPlease follow up personally.`,
          parse_mode: 'HTML'
        })
      });
      logger.info('Escalation notification sent to owner', { business: this.profile.business_name });
    } catch (e) {
      logger.error('Failed to send escalation notification', { error: e.message });
    }
  }
}

// ============================================================================
// BUSINESS PROFILE MANAGEMENT
// ============================================================================

/**
 * Create or update a business profile.
 */
export function saveBusinessProfile(userId, profile) {
  const db = getDatabase();
  if (profile.id) {
    // Update existing
    db.prepare(`
      UPDATE max_business_profiles
      SET business_name = ?, business_type = ?, agent_name = ?, agent_personality = ?,
          language = ?, escalation_contact = ?, working_hours = ?, telegram_notify_id = ?,
          is_active = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(
      profile.business_name, profile.business_type, profile.agent_name,
      profile.agent_personality, profile.language, profile.escalation_contact,
      profile.working_hours, profile.telegram_notify_id,
      profile.is_active !== false ? 1 : 0,
      profile.id, userId
    );
    return { id: profile.id, ...profile };
  } else {
    // Create new
    const result = db.prepare(`
      INSERT INTO max_business_profiles
      (user_id, business_name, business_type, agent_name, agent_personality,
       language, escalation_contact, working_hours, telegram_notify_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      userId,
      profile.business_name, profile.business_type, profile.agent_name || 'MAX',
      profile.agent_personality || 'friendly, professional, helpful',
      profile.language || 'English',
      profile.escalation_contact, profile.working_hours, profile.telegram_notify_id
    );
    return { id: result.lastInsertRowid, ...profile };
  }
}

/**
 * Get the active business profile for a user.
 */
export function getActiveBusinessProfile(userId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM max_business_profiles
    WHERE user_id = ? AND is_active = 1
    ORDER BY updated_at DESC LIMIT 1
  `).get(userId);
}

/**
 * List all business profiles for a user.
 */
export function listBusinessProfiles(userId) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM max_business_profiles
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).all(userId);
}

export default { CustomerServiceAgent, saveBusinessProfile, getActiveBusinessProfile, listBusinessProfiles };
