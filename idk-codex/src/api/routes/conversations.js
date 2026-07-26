/**
 * Conversations API Routes
 * REST endpoints for chat history management
 *
 * GET    /api/conversations              — list conversations
 * POST   /api/conversations              — create conversation
 * GET    /api/conversations/:id          — get conversation + messages
 * DELETE /api/conversations/:id          — delete conversation
 * PATCH  /api/conversations/:id          — rename conversation
 * POST   /api/conversations/:id/messages — send a message (triggers agent)
 */

import express from 'express';
import {
  createConversation,
  listConversations,
  getConversation,
  addConversationMessage,
  deleteConversation,
  renameConversation,
  isSupabaseConfigured
} from '../../database/conversations-supabase.js';
import { executeReActLoop } from '../../agent/react-loop-v2.js';
import { broadcastMessage, broadcastToken } from '../websocket.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Run migration on first load
// Initialize SQLite migration (for fallback when Supabase not configured)
try {
  const { migrateConversations } = await import('../../database/conversations.js');
  migrateConversations();
} catch (e) { /* ok */ }

const USER_ID = 'default-user';

// Log storage mode on startup
logger.info('Conversation storage', { supabase: isSupabaseConfigured() ? 'ENABLED (persistent)' : 'DISABLED (SQLite ephemeral)' });

// ============================================================================
// LIST CONVERSATIONS
// ============================================================================
router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId || USER_ID;
    const conversations = await listConversations(userId);
    res.json({ success: true, conversations, storage: isSupabaseConfigured() ? 'supabase' : 'sqlite' });
  } catch (err) {
    logger.error('Failed to list conversations', { error: err.message });
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// ============================================================================
// CREATE CONVERSATION
// ============================================================================
router.post('/', async (req, res) => {
  try {
    const userId = req.body.userId || USER_ID;
    const platform = req.body.platform || 'web';
    const title = req.body.title || 'New Conversation';

    const conv = await createConversation(userId, platform, title);
    res.json({ success: true, conversation: conv });
  } catch (err) {
    logger.error('Failed to create conversation', { error: err.message });
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// ============================================================================
// GET CONVERSATION + MESSAGES
// ============================================================================
router.get('/:id', async (req, res) => {
  try {
    const userId = req.query.userId || USER_ID;
    const conv = await getConversation(req.params.id, userId);

    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true, conversation: conv });
  } catch (err) {
    logger.error('Failed to get conversation', { error: err.message });
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// ============================================================================
// DELETE CONVERSATION
// ============================================================================
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.query.userId || USER_ID;
    const deleted = await deleteConversation(req.params.id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to delete conversation', { error: err.message });
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ============================================================================
// RENAME CONVERSATION
// ============================================================================
router.patch('/:id', async (req, res) => {
  try {
    const userId = req.body.userId || USER_ID;
    const title = req.body.title;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const renamed = await renameConversation(req.params.id, userId, title);
    if (!renamed) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to rename conversation', { error: err.message });
    res.status(500).json({ error: 'Failed to rename conversation' });
  }
});

// ============================================================================
// SEND MESSAGE (triggers ReAct agent loop)
// ============================================================================
router.post('/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const userId = req.body.userId || USER_ID;
    const { message, runAgent, images } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Verify conversation exists
    const conv = await getConversation(conversationId, userId);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Save the user's message (include image metadata if provided)
    const userMetadata = images && images.length > 0 ? { imageCount: images.length } : null;
    const userMsg = await addConversationMessage(conversationId, 'user', message, userMetadata);

    // Broadcast the user message
    broadcastMessage(conversationId, {
      role: 'user',
      content: message,
      conversationId,
      images: images || undefined
    });

    // INTENT DETECTION — decide if this is a task or just chat
    // This prevents "Hi" from triggering a 15-iteration agent loop
    const lowerMsg = message.toLowerCase().trim();
    const isTask = detectTaskIntent(lowerMsg, message);

    if (!isTask) {
      // This is a chat message — respond with LLM directly, no agent loop
      res.json({
        success: true,
        messageId: userMsg.id,
        agentStarted: false,
        intent: 'chat'
      });

      // Generate a chat response in the background
      setImmediate(async () => {
        try {
          const { generateCompletion } = await import('../../groq/client.js');

          // Build conversation context from recent messages
          const recentMessages = (conv.messages || []).slice(-6).map(m => ({
            role: m.role,
            content: m.content
          }));

          // Build the user message — if images were attached, send as multimodal
          // content array (OpenAI vision format)
          let userMessageContent;
          if (images && images.length > 0) {
            userMessageContent = [
              { type: 'text', text: message },
              ...images.map(img => ({
                type: 'image_url',
                image_url: { url: img, detail: 'high' }
              }))
            ];
          } else {
            userMessageContent = message;
          }

          const messages = [
            {
              role: 'system',
              content: 'You are MAX, a helpful AI assistant. You are also an autonomous coding agent, but right now you are just chatting. Be friendly, concise, and natural. If the user asks you to build something, tell them to be more specific about what they want to create. If the user shares an image, describe what you see and ask how you can help.'
            },
            ...recentMessages,
            { role: 'user', content: userMessageContent }
          ];

          // Disable Echo for chat — the adapter checks ECHO_PROVIDER_ENABLED at call time
          process.env.ECHO_PROVIDER_ENABLED = 'false';

          // ===== STREAMING CHAT RESPONSE =====
          // Call the OpenRouter API directly with stream:true and pipe tokens
          // to the WebSocket room, so the UI renders character-by-character.
          let response = '';
          try {
            const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL || 'https://openrouter.ai/api/v1';
            const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
            const candidateModels = [
              process.env.OPENAI_COMPATIBLE_MODEL,
              'openai/gpt-oss-20b:free',          // ✓ known working
              'openai/gpt-oss-120b:free',
              'deepseek/deepseek-chat',           // paid fallback
              'meta-llama/llama-3.3-70b-instruct' // paid fallback
            ].filter(Boolean);

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
            if (baseURL.includes('openrouter.ai')) {
              headers['HTTP-Referer'] = 'https://maxxxxx-production.up.railway.app';
              headers['X-Title'] = 'MAX Agent';
            }

            // Notify UI: streaming is starting
            broadcastToken(conversationId, { type: 'start', model: 'chat' });

            let success = false;
            let lastErr = null;
            for (const model of candidateModels) {
              try {
                const llmResp = await fetch(baseURL + '/chat/completions', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.7,
                    max_tokens: 800,
                    stream: true
                  })
                });
                if (!llmResp.ok) {
                  const errText = await llmResp.text();
                  logger.warn('Chat stream model unavailable, trying next', { model, status: llmResp.status, err: errText.substring(0, 150) });
                  lastErr = new Error('HTTP ' + llmResp.status + ': ' + errText.substring(0, 100));
                  continue;
                }

                // Consume the SSE stream
                const reader = llmResp.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buf += decoder.decode(value, { stream: true });
                  let sep;
                  while ((sep = buf.indexOf('\n\n')) >= 0) {
                    const evt = buf.slice(0, sep);
                    buf = buf.slice(sep + 2);
                    for (const line of evt.split('\n')) {
                      if (!line.startsWith('data: ')) continue;
                      const payload = line.slice(6).trim();
                      if (payload === '[DONE]') continue;
                      try {
                        const chunk = JSON.parse(payload);
                        const delta = chunk.choices?.[0]?.delta;
                        if (delta?.content) {
                          response += delta.content;
                          broadcastToken(conversationId, { type: 'token', text: delta.content });
                        }
                      } catch (e) { /* partial JSON */ }
                    }
                  }
                }
                success = true;
                logger.info('Chat stream completed', { model, length: response.length });
                break;
              } catch (e) {
                lastErr = e;
                continue;
              }
            }

            // Restore Echo for the ReAct agent loop (which may still need it as last resort)
            process.env.ECHO_PROVIDER_ENABLED = 'true';

            // Notify UI: streaming is done
            broadcastToken(conversationId, { type: 'done', model: 'chat' });

            if (!success || !response) {
              // Streaming failed entirely — fall back to adapter
              logger.warn('Chat stream failed, falling back to adapter', { error: lastErr?.message });
              const result = await generateCompletion(messages, { temperature: 0.7, maxTokens: 800 });
              response = result?.content || '';
            }

            response = response || 'Sorry, I could not generate a response.';

            await addConversationMessage(conversationId, 'assistant', response);
            broadcastMessage(conversationId, {
              role: 'assistant',
              content: response,
              conversationId
            });
          } catch (streamErr) {
            // Streaming threw — fall back to adapter
            logger.warn('Chat stream threw, using adapter', { error: streamErr.message });
            process.env.ECHO_PROVIDER_ENABLED = 'true';
            const result = await generateCompletion(messages, { temperature: 0.7, maxTokens: 800 });
            response = result?.content || 'Sorry, I could not generate a response.';
            broadcastToken(conversationId, { type: 'done', model: 'chat' });
            await addConversationMessage(conversationId, 'assistant', response);
            broadcastMessage(conversationId, {
              role: 'assistant',
              content: response,
              conversationId
            });
          }
        } catch (err) {
          logger.error('Chat response failed', { error: err.message });
          const fallback = '⚠️ All AI providers are currently rate-limited or unavailable.\n\n' +
            'To fix this permanently, add a free OpenRouter API key:\n' +
            '1. Go to https://openrouter.ai/keys\n' +
            '2. Create a free key\n' +
            '3. Add OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_API_KEY to Railway';
          await addConversationMessage(conversationId, 'assistant', fallback);
          broadcastMessage(conversationId, {
            role: 'assistant',
            content: fallback,
            conversationId
          });
        }
      });
      return;
    }

    // This is a task — run the ReAct agent loop
    res.json({
      success: true,
      messageId: userMsg.id,
      agentStarted: true,
      conversationId,
      intent: 'task'
    });

    // Execute the agent loop asynchronously
    setImmediate(async () => {
      try {
        // If images are attached, prepend image context to the task
        let fullTask = message;
        if (images && images.length > 0) {
          fullTask = message + '\n\n[User attached ' + images.length + ' image(s). Use browser_screenshot or analyze the user description to understand them.]';
        }

        const result = await executeReActLoop(fullTask, conversationId, userId, {
          workspacePath: process.env.SANDBOX_WORKSPACE || './sandbox-workspace'
        });

        await addConversationMessage(conversationId, 'assistant', result.summary, {
          type: 'task_complete',
          iterations: result.iterations,
          filesModified: result.filesModified
        });

        logger.info('Agent loop completed', {
          conversationId,
          iterations: result.iterations,
          success: result.success
        });
      } catch (err) {
        logger.error('Agent loop failed', { conversationId, error: err.message });
        await addConversationMessage(conversationId, 'assistant', 'Error: ' + err.message, { type: 'error' });
        broadcastMessage(conversationId, {
          role: 'assistant',
          content: 'Error: ' + err.message,
          type: 'error'
        });
      }
    });
  } catch (err) {
    logger.error('Failed to send message', { error: err.message });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * Detect if a message is a task (should trigger agent) or chat (just respond)
 */
function detectTaskIntent(lowerMsg, originalMsg) {
  // Short messages (< 15 chars) are almost always chat
  if (originalMsg.trim().length < 15) return false;

  // Greetings and social
  const greetings = ['hi', 'hey', 'hello', 'sup', 'yo', 'how are you', 'good morning', 'good afternoon', 'good evening', 'whats up', "what's up", 'howdy', 'thanks', 'thank you', 'bye', 'goodbye', 'ok', 'okay', 'cool', 'nice', 'great', 'awesome', "i'm doing", 'im doing', 'i am doing'];
  if (greetings.some(g => lowerMsg === g || lowerMsg.startsWith(g + ' ') || lowerMsg === g.replace(' ', ''))) {
    return false;
  }

  // Conversational starters — messages that START with chat-like phrases
  // are chat even if they contain task keywords later
  const chatStarters = [
    "i'm doing", "im doing", "i am doing", "i'm okay", "im okay",
    "i'm good", "im good", "i'm fine", "im fine",
    "yeah", "yes", "no", "not really", "maybe",
    "that sounds", "that's great", "thats great",
    "what about you", "how about you", "hbu",
    "actually", "honestly", "to be honest",
    "i think", "i feel", "i believe", "in my opinion",
    "thanks for", "thank you for", "appreciate",
    "sorry", "my bad", "oops",
    "lol", "haha", "lmao", "nice one", "good one",
    "anyway", "anyways", "so", "well", "ok so", "okay so"
  ];
  if (chatStarters.some(s => lowerMsg.startsWith(s))) {
    return false;
  }

  // Questions are ALWAYS chat
  const questionPatterns = [
    'tell me what', 'tell me about', 'tell me how', 'tell me why',
    'what is', 'what are', 'what does', 'what do', 'what\'s', 'whats',
    'how do', 'how does', 'how is', 'how can', 'how to',
    'why is', 'why does', 'why do', 'why are',
    'can you explain', 'explain what', 'explain how',
    'who is', 'who are', 'when is', 'when was', 'where is',
    'do you think', 'what\'s your opinion', 'whats your opinion',
    'is it', 'are they', 'should i', 'could i',
    'what do you know', 'what can you tell'
  ];
  if (questionPatterns.some(p => lowerMsg.startsWith(p))) {
    return false;
  }

  // Tasks MUST start with an imperative verb
  // "Build a store" = task ✓
  // "I need you to help Build a store" = chat (doesn't start with verb)
  const hasImperativeStart = /^(build|create|make|write|generate|fix|add|remove|delete|update|refactor|deploy|run|test|install|set up|configure|clone|push|implement|develop|design|write)\b/i.test(originalMsg.trim());

  if (!hasImperativeStart) {
    return false;
  }

  // Only treat as task if it starts with a verb AND is longer than 20 chars
  return originalMsg.trim().length > 20;
}

export default router;
