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
import { optionalAuth } from '../../auth/middleware.js';
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

// Apply optionalAuth to all conversation routes — extracts user from JWT if present
router.use(optionalAuth);

// Run migration on first load
// Initialize SQLite migration (for fallback when Supabase not configured)
try {
  const { migrateConversations } = await import('../../database/conversations.js');
  migrateConversations();
} catch (e) { /* ok */ }

const USER_ID = 'web_user'; // fallback when no auth

// Log storage mode on startup
logger.info('Conversation storage', { supabase: isSupabaseConfigured() ? 'ENABLED (persistent)' : 'DISABLED (SQLite ephemeral)' });

// ============================================================================
// LIST CONVERSATIONS
// ============================================================================
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
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
    const userId = req.user.id;
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
    const userId = req.user.id;
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
    const userId = req.user.id;
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
    const userId = req.user.id;
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
    const userId = req.user.id;
    const { message, runAgent, images } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Verify conversation exists
    const conv = await getConversation(conversationId, userId);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Save the user's message
    const userMsg = await addConversationMessage(conversationId, 'user', message);

    // Broadcast the user message
    broadcastMessage(conversationId, {
      role: 'user',
      content: message,
      conversationId
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

          // Build the user message — support image attachments (vision)
          let userMessageContent;
          if (images && images.length > 0) {
            userMessageContent = [
              { type: 'text', text: message },
              ...images.map(img => ({ type: 'image_url', image_url: { url: img, detail: 'high' } }))
            ];
          } else {
            userMessageContent = message;
          }

          // Detect if the user is asking about something that needs web access.
          // If so, give the chat path a web_fetch tool so the LLM can actually
          // fetch URLs instead of saying "I can't browse the web".
          const wantsWebAccess = /\b(search|look up|browse|web|website|url|latest news|what.*happening|current|today|recent|news|online)\b/i.test(message);

          // Smart system prompt that explains WHEN to use which tool
          const systemPrompt = 'You are MAX, a helpful AI assistant. You are also an autonomous coding agent with access to tools.' +
            '\n\nWhen to use tools:' +
            '\n- If the user asks to BUILD, CREATE, or WRITE something → tell them to phrase it as a task (e.g. "Build a snake game") and the full agent will run.' +
            '\n- If the user asks you to LOOK UP, SEARCH, or FETCH something from the web → use the web_fetch tool to get real, current information.' +
            '\n- If the user asks a general knowledge question → just answer from your training data, no tool needed.' +
            '\n- If you don\'t know something or it\'s time-sensitive (news, current events, latest versions) → use web_fetch.' +
            '\n\nBe friendly, concise, and natural. Never say "I can\'t browse the web" — if you have the web_fetch tool, USE IT.' +
            (wantsWebAccess ? '\n\nThe user seems to want current/web information. Use web_fetch to get real data before answering.' : '');

          const messages = [
            { role: 'system', content: systemPrompt },
            ...recentMessages,
            { role: 'user', content: userMessageContent }
          ];

          // Disable Echo for chat
          process.env.ECHO_PROVIDER_ENABLED = 'false';

          let result;
          if (wantsWebAccess) {
            // Give the chat path a web_fetch tool so it can actually browse
            const webFetchTool = [{
              type: 'function',
              function: {
                name: 'web_fetch',
                description: 'Fetch a URL and return the text content. Use this to look up current information, news, documentation, or any web page. Always use this when the user asks about something current or you need real-time data — never say "I can\'t browse the web".',
                parameters: {
                  type: 'object',
                  properties: { url: { type: 'string', description: 'The URL to fetch' } },
                  required: ['url']
                }
              }
            }];

            try {
              result = await generateCompletion(messages, {
                temperature: 0.7,
                maxTokens: 800,
                tools: webFetchTool,
                tool_choice: 'auto'
              });

              // If the LLM called web_fetch, execute it and feed result back
              if (result?.tool_calls && result.tool_calls.length > 0) {
                let responseText = result.content || '';
                for (const tc of result.tool_calls) {
                  const toolName = tc.function?.name;
                  if (toolName === 'web_fetch') {
                    let toolArgs = {};
                    try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch (e) {}
                    if (toolArgs.url) {
                      try {
                        const { executeTool } = await import('../../agent/tools/registry.js');
                        const fetchResult = await executeTool('web_fetch', { url: toolArgs.url }, { userId, sessionId: conversationId });
                        // Feed the tool result back to the LLM for a final response
                        const followUpMessages = [
                          ...messages,
                          { role: 'assistant', content: responseText, tool_calls: result.tool_calls },
                          { role: 'tool', tool_call_id: tc.id || 'web_fetch', content: String(fetchResult).substring(0, 4000) }
                        ];
                        const followUp = await generateCompletion(followUpMessages, { temperature: 0.7, maxTokens: 800 });
                        responseText = followUp?.content || responseText;
                      } catch (fetchErr) {
                        responseText += '\n\n(Web fetch failed: ' + fetchErr.message + ')';
                      }
                    }
                  }
                }
                result = { content: responseText };
              }
            } catch (toolErr) {
              // Tool-calling failed — fall back to plain generation
              logger.warn('Chat with tools failed, falling back', { error: toolErr.message });
              result = await generateCompletion(messages, { temperature: 0.7, maxTokens: 800 });
            }
          } else {
            // Plain chat — no tools needed
            result = await generateCompletion(messages, { temperature: 0.7, maxTokens: 800 });
          }

          // Restore Echo for the ReAct agent loop
          process.env.ECHO_PROVIDER_ENABLED = 'true';

          const response = result?.content || 'Sorry, I could not generate a response.';

          await addConversationMessage(conversationId, 'assistant', response);
          broadcastMessage(conversationId, {
            role: 'assistant',
            content: response,
            conversationId
          });
        } catch (err) {
          logger.error('Chat response failed', { error: err.message });
          process.env.ECHO_PROVIDER_ENABLED = 'true';
          const fallback = '⚠️ I could not generate a response right now.\n\nTo fix this permanently, add a free OpenRouter API key:\n1. Go to https://openrouter.ai/keys\n2. Create a free key\n3. Add OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_API_KEY to Railway';
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
        const result = await executeReActLoop(message, conversationId, userId, {
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
 * Detect if a message is a task (should trigger agent with tools) or chat.
 *
 * CRITICAL: If the user explicitly requests a tool — web search, browser,
 * fetch, look up, browse — this is ALWAYS a task, even if phrased as a
 * question. Without this, the agent says "I can't browse the web" because
 * the chat-mode path doesn't expose tools.
 */
function detectTaskIntent(lowerMsg, originalMsg) {
  // Short messages (< 15 chars) are almost always chat
  if (originalMsg.trim().length < 15) return false;

  // ===== TOOL REQUEST PATTERNS — always trigger the agent loop =====
  // These phrases mean the user wants MAX to DO something with a tool,
  // not just talk about it.
  const toolRequestPatterns = [
    // Web / browsing
    /\b(search the web|web search|google search|look up online|look up the latest|search online|browse the web|browse to|open the website|visit the website|fetch the url|fetch the page|scrape the|crawl the)\b/i,
    /\b(use the (browser|web|search)|use a tool|use tools|using the browser|using tools)\b/i,
    /\b(find (the |me )?latest|find (online|on the web|on google))\b/i,
    /\b(check (the |my )?(website|url|api|endpoint|status|health))\b/i,
    // Follow-up search requests — "get more", "more", "20 more", "show me more"
    /\b(get more|give me more|show me more|more (news|results|articles|stories)|find more|search (for |again )?more|\d+ more)\b/i,
    /\b(news from|news about|news today|what.*happening|what.*going on)\b/i,
    // GitHub
    /\b(check (my |the )?(repo|github|issues|prs|pull requests))\b/i,
    /\b(list (my |the )?(issues|prs|pull requests|repos))\b/i,
    // Supabase / database
    /\b(query (my |the )?(supabase|database|db)|check (my |the )?supabase)\b/i,
    // File operations
    /\b(read (the |my )?file|list (the |my )?files|search (the |my )?files)\b/i,
    // Memory / knowledge
    /\b(save (this|that) to memory|remember this|add to knowledge|search (my |the )?knowledge)\b/i,
    // Credentials
    /\b(save (my )?(credentials|login|password|api key)|log into|sign into)\b/i
  ];
  if (toolRequestPatterns.some(p => p.test(originalMsg))) {
    return true;
  }

  // Greetings and social — chat
  const greetings = ['hi', 'hey', 'hello', 'sup', 'yo', 'how are you', 'good morning', 'good afternoon', 'good evening', 'whats up', "what's up", 'howdy', 'thanks', 'thank you', 'bye', 'goodbye', 'ok', 'okay', 'cool', 'nice', 'great', 'awesome', "i'm doing", 'im doing', 'i am doing'];
  if (greetings.some(g => lowerMsg === g || lowerMsg.startsWith(g + ' ') || lowerMsg === g.replace(' ', ''))) {
    return false;
  }

  // Conversational starters — chat
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

  // Questions that DON'T request tools are chat.
  // But questions that DO request tools were already caught above.
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
  const hasImperativeStart = /^(build|create|make|write|generate|fix|add|remove|delete|update|refactor|deploy|run|test|install|set up|configure|clone|push|implement|develop|design|write|search|find|look|browse|fetch|check|read|list|save|send|email|call|query)\b/i.test(originalMsg.trim());

  if (!hasImperativeStart) {
    return false;
  }

  // Only treat as task if it starts with a verb AND is longer than 20 chars
  return originalMsg.trim().length > 20;
}

export default router;
