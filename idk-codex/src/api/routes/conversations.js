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
  migrateConversations
} from '../../database/conversations.js';
import { executeReActLoop } from '../../agent/react-loop-v2.js';
import { broadcastMessage } from '../websocket.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Run migration on first load
try { migrateConversations(); } catch (e) { logger.warn('Conversation migration skipped', { error: e.message }); }

const USER_ID = 'default-user'; // TODO: real auth

// ============================================================================
// LIST CONVERSATIONS
// ============================================================================
router.get('/', (req, res) => {
  try {
    const userId = req.query.userId || USER_ID;
    const conversations = listConversations(userId);
    res.json({ success: true, conversations });
  } catch (err) {
    logger.error('Failed to list conversations', { error: err.message });
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// ============================================================================
// CREATE CONVERSATION
// ============================================================================
router.post('/', (req, res) => {
  try {
    const userId = req.body.userId || USER_ID;
    const platform = req.body.platform || 'web';
    const title = req.body.title || 'New Conversation';

    const conv = createConversation(userId, platform, title);
    res.json({ success: true, conversation: conv });
  } catch (err) {
    logger.error('Failed to create conversation', { error: err.message });
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// ============================================================================
// GET CONVERSATION + MESSAGES
// ============================================================================
router.get('/:id', (req, res) => {
  try {
    const userId = req.query.userId || USER_ID;
    const conv = getConversation(req.params.id, userId);

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
router.delete('/:id', (req, res) => {
  try {
    const userId = req.query.userId || USER_ID;
    const deleted = deleteConversation(req.params.id, userId);

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
router.patch('/:id', (req, res) => {
  try {
    const userId = req.body.userId || USER_ID;
    const title = req.body.title;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const renamed = renameConversation(req.params.id, userId, title);
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
    const { message, runAgent } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Verify conversation exists
    const conv = getConversation(conversationId, userId);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Save the user's message
    const userMsg = addConversationMessage(conversationId, 'user', message);

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

          const messages = [
            {
              role: 'system',
              content: 'You are MAX, a helpful AI assistant. You are also an autonomous coding agent, but right now you are just chatting. Be friendly, concise, and natural. If the user asks you to build something, tell them to be more specific about what they want to create.'
            },
            ...recentMessages,
            { role: 'user', content: message }
          ];

          // Disable Echo for chat — the adapter checks ECHO_PROVIDER_ENABLED at call time
          process.env.ECHO_PROVIDER_ENABLED = 'false';

          const result = await generateCompletion(messages, {
            temperature: 0.7,
            maxTokens: 800
          });

          // Restore Echo for the ReAct agent loop (which may still need it as last resort)
          process.env.ECHO_PROVIDER_ENABLED = 'true';

          const response = result?.content || 'Sorry, I could not generate a response.';

          addConversationMessage(conversationId, 'assistant', response);
          broadcastMessage(conversationId, {
            role: 'assistant',
            content: response,
            conversationId
          });
        } catch (err) {
          logger.error('Chat response failed', { error: err.message });
          const fallback = 'I heard you! If you want me to build something, just tell me what to create — like "build a snake game" or "create a Python script".';
          addConversationMessage(conversationId, 'assistant', fallback);
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

        addConversationMessage(conversationId, 'assistant', result.summary, {
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
        addConversationMessage(conversationId, 'assistant', 'Error: ' + err.message, { type: 'error' });
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
  const greetings = ['hi', 'hey', 'hello', 'sup', 'yo', 'how are you', 'good morning', 'good afternoon', 'good evening', 'whats up', "what's up", 'howdy', 'thanks', 'thank you', 'bye', 'goodbye', 'ok', 'okay', 'cool', 'nice', 'great', 'awesome'];
  if (greetings.some(g => lowerMsg === g || lowerMsg.startsWith(g + ' ') || lowerMsg === g.replace(' ', ''))) {
    return false;
  }

  // Questions (not about building something)
  if (lowerMsg.startsWith('what is') || lowerMsg.startsWith('what are') || lowerMsg.startsWith('how do') || lowerMsg.startsWith('how does') || lowerMsg.startsWith('why') || lowerMsg.startsWith('can you explain') || lowerMsg.startsWith('what\'s') || lowerMsg.startsWith('whats')) {
    // But if it contains task keywords, it's still a task
    const taskKeywords = ['build', 'create', 'make', 'write', 'generate', 'implement', 'code', 'script', 'file', 'app', 'page'];
    if (!taskKeywords.some(kw => lowerMsg.includes(kw))) {
      return false;
    }
  }

  // Task keywords — if present, it's a task
  const taskKeywords = [
    'build', 'create', 'make', 'write', 'generate', 'implement', 'develop',
    'fix', 'refactor', 'update', 'modify', 'edit', 'change', 'delete',
    'design', 'setup', 'set up', 'configure', 'deploy', 'install',
    'code', 'function', 'component', 'page', 'app', 'script',
    'api', 'endpoint', 'route', 'database', 'schema',
    'html', 'css', 'javascript', 'python', 'react', 'node',
    'bug', 'error', 'broken', 'not working', 'failing',
    'test', 'feature', 'login', 'signup', 'dashboard',
    'landing page', 'website', 'web app', 'backend', 'frontend',
    'clone', 'repo', 'push', 'commit', 'git'
  ];

  if (taskKeywords.some(kw => lowerMsg.includes(kw))) {
    return true;
  }

  // Imperative verbs at the start
  if (/^(build|create|make|write|generate|fix|add|remove|delete|update|refactor|deploy|run|test|install|set up|configure)/i.test(originalMsg.trim())) {
    return true;
  }

  // Default: treat as chat
  return false;
}

export default router;
