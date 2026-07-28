/**
 * Telegram Bot Handler — Natural Language Chat Mode
 *
 * This handler lets the user talk to MAX like a normal chatbot.
 * No more /commands required. The bot detects intent from the message:
 *
 *   - "build a snake game"           → run as agent task
 *   - "what's the weather?"          → answer conversationally
 *   - "show me status"               → status report
 *   - "/repo https://..."            → still works (slash commands supported)
 *   - "hey how are you?"             → friendly reply
 *
 * The bot is both a normal chatbot AND a super agent at the same time.
 */

import logger from '../utils/logger.js';
import { getOrCreateSession, addMessage } from '../database/queries.js';
import { executeReActLoop } from '../agent/react-loop-v2.js';
import { generateCompletion } from '../groq/client.js';
import { getModelOptions, getModelById, getDefaultModel } from '../llm/model-registry.js';
import { Markup } from 'telegraf';

// ============================================================================
// INTENT DETECTION
// ============================================================================

/**
 * Detect what the user wants from their message.
 * Returns one of: 'task', 'chat', 'status', 'help', 'repo', 'push',
 *                  'model', 'greeting', 'cancel'
 *
 * @param {string} text - the user's message
 * @returns {Object} { intent, payload }
 */
function detectIntent(text) {
  const t = (text || '').trim();
  const lower = t.toLowerCase();

  // Slash commands always win
  if (lower.startsWith('/start')) return { intent: 'start' };
  if (lower.startsWith('/link')) return { intent: 'link', payload: t.replace('/link', '').trim() };
  if (lower.startsWith('/unlink')) return { intent: 'unlink' };
  if (lower.startsWith('/help')) return { intent: 'help' };
  if (lower.startsWith('/status')) return { intent: 'status' };
  if (lower.startsWith('/repos')) return { intent: 'repos' };
  if (lower.startsWith('/repo ')) return { intent: 'repo', payload: t.replace('/repo', '').trim() };
  if (lower.startsWith('/repo')) return { intent: 'repo', payload: '' };
  if (lower.startsWith('/model')) return { intent: 'model' };
  if (lower.startsWith('/agents')) return { intent: 'agents' };
  if (lower.startsWith('/task ')) return { intent: 'task', payload: t.replace('/task', '').trim() };
  if (lower.startsWith('/push')) return { intent: 'push', payload: t.replace('/push', '').trim() };
  if (lower.startsWith('/fix ')) return { intent: 'task', payload: 'fix: ' + t.replace('/fix', '').trim() };
  if (lower.startsWith('/cancel')) return { intent: 'cancel' };
  if (lower.startsWith('/watch')) return { intent: 'watch', payload: t.replace('/watch', '').trim() };
  if (lower.startsWith('/unwatch')) return { intent: 'unwatch', payload: t.replace('/unwatch', '').trim() };
  if (lower.startsWith('/rules')) return { intent: 'rules' };
  if (lower.startsWith('/share')) return { intent: 'share' };
  if (lower.startsWith('/logs')) return { intent: 'logs' };
  if (lower.startsWith('/review_pr')) return { intent: 'review_pr', payload: t.replace('/review_pr', '').trim() };
  if (lower.startsWith('/watch')) return { intent: 'watch', payload: t.replace('/watch', '').trim() };
  if (lower.startsWith('/unwatch')) return { intent: 'unwatch', payload: t.replace('/unwatch', '').trim() };
  if (lower.startsWith('/rules')) return { intent: 'rules' };
  if (lower.startsWith('/share')) return { intent: 'share' };
  if (lower.startsWith('/cs_setup')) return { intent: 'cs_setup' };
  if (lower.startsWith('/cs_status')) return { intent: 'cs_status' };
  if (lower.startsWith('/cs_disable')) return { intent: 'cs_disable' };
  if (lower.startsWith('/knowledge_add')) return { intent: 'knowledge_add', payload: t.replace('/knowledge_add', '').trim() };
  if (lower.startsWith('/knowledge_list')) return { intent: 'knowledge_list' };
  if (lower.startsWith('/credentials')) return { intent: 'credentials_list' };
  if (lower.startsWith('/permissions')) return { intent: 'permissions' };

  // Natural language detection — no slash commands needed

  // Greetings & small talk
  const greetings = ['hello', 'hi ', 'hey', 'sup', 'yo ', 'good morning', 'good evening', 'good afternoon', 'how are you', "what's up", 'whats up'];
  if (greetings.some(g => lower === g.trim() || lower.startsWith(g) || lower === g.trim().replace(' ', ''))) {
    return { intent: 'greeting' };
  }

  // Status requests
  const statusPhrases = ['status', 'how\'s it going', 'whats the status', "what's the status", 'current state', 'where are we', 'session info', 'show session'];
  if (statusPhrases.some(p => lower.includes(p))) {
    return { intent: 'status' };
  }

  // Help requests
  const helpPhrases = ['help', 'what can you do', 'commands', 'how do i use', 'what do you do', 'who are you', 'what are you'];
  if (helpPhrases.some(p => lower.includes(p)) && lower.length < 80) {
    return { intent: 'help' };
  }

  // Cancel requests
  const cancelPhrases = ['cancel', 'stop', 'abort', 'never mind', 'nevermind', 'quit'];
  if (cancelPhrases.some(p => lower === p || (lower.includes(p) && lower.length < 30))) {
    return { intent: 'cancel' };
  }

  // Repo clone requests
  const repoClonePhrases = ['clone repo', 'clone this repo', 'clone the repo', 'work on repo', 'load repo', 'load this repo'];
  const hasGithubUrl = lower.includes('github.com') || lower.includes('git@github');
  if (hasGithubUrl || repoClonePhrases.some(p => lower.includes(p))) {
    // Extract URL if present
    const urlMatch = t.match(/(https?:\/\/[^\s]+\.git|https?:\/\/github\.com\/[^\s]+|git@github\.com:[^\s]+)/i);
    return { intent: 'repo', payload: urlMatch ? urlMatch[1] : '' };
  }

  // Push requests
  const pushPhrases = ['push changes', 'commit and push', 'push to github', 'push it', 'commit changes', 'git push', 'push the code', 'send to github'];
  if (pushPhrases.some(p => lower.includes(p))) {
    return { intent: 'push', payload: t.replace(/.*push/i, '').replace(/.*commit/i, '').trim() || '' };
  }

  // Model selection
  const modelPhrases = ['switch model', 'change model', 'which model', 'what model', 'pick model', 'select model', 'use a different model'];
  if (modelPhrases.some(p => lower.includes(p))) {
    return { intent: 'model' };
  }

  // Question detection — questions are ALWAYS chat, never tasks
  const questionPatterns = [
    'tell me what', 'tell me about', 'tell me how', 'tell me why',
    'what is', 'what are', 'what does', 'what do',
    'how do', 'how does', 'how is', 'how can',
    'why is', 'why does', 'why do', 'why are',
    'can you explain', 'explain what', 'explain how',
    'what\'s the difference', 'whats the difference',
    'do you think', 'what\'s your opinion', 'whats your opinion',
    'who is', 'who are', 'when is', 'when was', 'where is',
    'is it', 'are they', 'should i', 'could i',
    'what do you know', 'what can you tell'
  ];
  if (questionPatterns.some(p => lower.startsWith(p) || lower.includes(' ' + p))) {
    return { intent: 'chat', payload: t };
  }

  // Task detection — coding/development requests
  // These keywords strongly suggest the user wants MAX to DO something
  // NOTE: language names (html, css, python) alone are NOT task keywords
  // — they're only tasks when combined with action verbs
  const taskKeywords = [
    'build', 'create', 'make', 'write', 'generate', 'implement', 'develop',
    'fix', 'refactor', 'update', 'modify', 'edit', 'change',
    'design', 'setup', 'set up', 'configure', 'deploy', 'install',
    'bug', 'error', 'broken', 'not working', 'failing',
    'landing page', 'web app', 'website',
    'clone', 'repo', 'push', 'commit', 'git'
  ];

  // Action verbs that indicate a task when at the START of the message
  const hasImperativeVerb = /^(build|create|make|write|generate|fix|add|remove|delete|update|refactor|deploy|run|test|install|set up|configure|clone|push)/i.test(t);

  // A message is a task ONLY if:
  // 1. It's longer than 15 chars
  // 2. It has an imperative verb at the start (build, create, etc.)
  // 3. OR it has a task keyword AND an action verb
  const isLongEnough = t.length > 15;
  const hasTaskKeyword = taskKeywords.some(kw => lower.includes(kw));
  const hasActionVerb = /\b(build|create|make|write|generate|fix|add|remove|delete|update|refactor|deploy|run|test|install|configure|clone|push|implement|develop|design)\b/i.test(t);

  if (isLongEnough && (hasImperativeVerb || (hasTaskKeyword && hasActionVerb))) {
    return { intent: 'task', payload: t };
  }

  // Default: treat as normal chat
  return { intent: 'chat', payload: t };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Main Telegram message handler — natural language mode
 */
export async function handleTelegramMessage(ctx) {
  const chatId = ctx.chat?.id;
  const telegramUserId = String(ctx.from?.id);
  const telegramUsername = ctx.from?.username || ctx.from?.first_name || 'Unknown';

  // Check if this Telegram user is linked to a website account
  // If linked → use the website user ID (shared conversations, memories, etc.)
  // If not linked → use telegram_<id> (isolated Telegram-only account)
  let userId;
  try {
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const link = db.prepare('SELECT user_id FROM max_telegram_links WHERE telegram_user_id = ?').get(telegramUserId);
    if (link) {
      userId = link.user_id; // Linked to website account
      logger.info('TG_LINKED_USER', { telegramUserId, websiteUserId: userId });
    } else {
      userId = `telegram_${telegramUserId}`; // Telegram-only account
    }
  } catch (e) {
    userId = `telegram_${telegramUserId}`; // Fallback
  }

  const text = ctx.message?.text || '';
  const messageType = ctx.message?.text ? 'text' : ctx.updateType;

  logger.info('TG_MSG', {
    chatId,
    userId,
    text: text.substring(0, 100),
    type: messageType,
    username: ctx.from?.username
  });

  // Show "typing..." indicator for longer-running intents
  if (text.length > 10) {
    try { await ctx.sendChatAction('typing'); } catch (e) { /* ignore */ }
  }

  try {
    const { intent, payload } = detectIntent(text);

    switch (intent) {
      case 'start':
        await handleStartCommand(ctx, userId);
        break;
      case 'link':
        await handleLinkCommand(ctx, telegramUserId, telegramUsername, payload);
        break;
      case 'unlink':
        await handleUnlinkCommand(ctx, telegramUserId);
        break;
      case 'help':
        await handleHelpCommand(ctx);
        break;
      case 'status':
        await handleStatusCommand(ctx, userId);
        break;
      case 'repos':
        await handleReposCommand(ctx, userId, text);
        break;
      case 'repo':
        await handleRepoCloneCommand(ctx, userId, '/repo ' + (payload || ''));
        break;
      case 'model':
        await handleModelCommand(ctx, userId);
        break;
      case 'agents':
        await handleAgentsCommand(ctx, userId);
        break;
      case 'task':
        await handleTaskCommand(ctx, userId, '/task ' + payload);
        break;
      case 'push':
        await handlePushCommand(ctx, userId, '/push ' + (payload || ''));
        break;
      case 'cancel':
        await handleCancelCommand(ctx, userId);
        break;
      case 'watch':
        await handleWatchCommand(ctx, userId, payload);
        break;
      case 'unwatch':
        await handleUnwatchCommand(ctx, userId, payload);
        break;
      case 'rules':
        await handleRulesCommand(ctx, userId);
        break;
      case 'share':
        await handleShareCommand(ctx, userId);
        break;
      case 'logs':
        await handleLogsCommand(ctx, text);
        break;
      case 'review_pr':
        await handleReviewPRCommand(ctx, userId, '/review_pr ' + (payload || ''));
        break;
      case 'watch':
        await handleWatchCommand(ctx, userId, payload);
        break;
      case 'unwatch':
        await handleUnwatchCommand(ctx, userId, payload);
        break;
      case 'rules':
        await handleRulesCommand(ctx, userId);
        break;
      case 'share':
        await handleShareCommand(ctx, userId);
        break;
      case 'cs_setup':
        await handleCsSetupCommand(ctx, userId, text);
        break;
      case 'cs_status':
        await handleCsStatusCommand(ctx, userId);
        break;
      case 'cs_disable':
        await handleCsDisableCommand(ctx, userId);
        break;
      case 'knowledge_add':
        await handleKnowledgeAddCommand(ctx, userId, payload);
        break;
      case 'knowledge_list':
        await handleKnowledgeListCommand(ctx, userId);
        break;
      case 'credentials_list':
        await handleCredentialsListCommand(ctx, userId);
        break;
      case 'permissions':
        await handlePermissionsCommand(ctx, userId);
        break;
      case 'greeting':
        await handleGreeting(ctx, userId, text);
        break;
      case 'chat':
      default:
        await handleChat(ctx, userId, text);
        break;
    }
  } catch (err) {
    logger.error('TG_CRASH', {
      error: err.message,
      stack: err.stack,
      chatId,
      userId,
      text: text.substring(0, 200)
    });
    await ctx.reply('❌ Something went wrong: ' + err.message + '\n\nTry rephrasing or send /help for options.');
  }
}

// ============================================================================
// NATURAL LANGUAGE HANDLERS
// ============================================================================

/**
 * Handle greeting — use LLM for natural response
 */
async function handleGreeting(ctx, userId, text) {
  // Use the same chat handler — let the LLM respond naturally
  await handleChat(ctx, userId, text);
}

/**
 * Handle normal chat — use the LLM to respond conversationally
 * This makes MAX act as a normal chatbot for questions and conversation.
 */
async function handleChat(ctx, userId, text) {
  try {
    await ctx.sendChatAction('typing');

    // Get the session
    const sessionId = await getOrCreateSession(userId, 'telegram');

    // Save the user's message
    await addMessage(sessionId, 'user', text);

    // Load the user's preferred model
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const prefs = db.prepare('SELECT preferred_model FROM user_preferences WHERE user_id = ?').get(String(userId));
    if (prefs?.preferred_model) {
      try {
        const { setProvider } = await import('../llm/adapter.js');
        setProvider(prefs.preferred_model);
      } catch (e) {
        logger.warn('Failed to set preferred model for chat', { error: e.message });
      }
    }

    // Build a conversational system prompt
    const messages = [
      {
        role: 'system',
        content: `You are MAX, a friendly and helpful autonomous coding agent. You're chatting with the user via Telegram.

You can:
- Have normal conversations about programming, technology, or anything
- Answer questions about code, software design, debugging, etc.
- When the user asks you to BUILD or CREATE something, suggest they say "build X" or "/task build X" to trigger the full agent loop (which writes files to the sandbox)
- Be concise but helpful. Use emojis sparingly. Match the user's tone.

The user's Telegram user ID is ${userId}. Be casual and friendly.`
      },
      {
        role: 'user',
        content: text
      }
    ];

    // Try to get a response from the LLM — NEVER use Echo for chat
    let response;
    try {
      // Temporarily disable Echo
      const prevEcho = process.env.ECHO_PROVIDER_ENABLED;
      process.env.ECHO_PROVIDER_ENABLED = 'false';

      const result = await generateCompletion(messages, {
        temperature: 0.7,
        maxTokens: 1000
      });

      process.env.ECHO_PROVIDER_ENABLED = prevEcho;
      response = result?.content || null;
    } catch (llmErr) {
      logger.warn('LLM chat failed', { error: llmErr.message });
      response = null;
    }

    // If LLM failed, be honest — don't fake it with Echo
    if (!response || response.trim() === '') {
      response = 'I couldn\'t reach any LLM provider right now. This usually means:\n\n' +
        '- Groq rate limit hit (wait a minute)\n' +
        '- Gemini quota exceeded\n' +
        '- Phone not connected\n\n' +
        'Try again in a moment, or connect your phone with Ollama for local inference.';
    }

    // Save the assistant's response
    await addMessage(sessionId, 'assistant', response);

    // Telegram has a 4096 char limit per message
    if (response.length > 4000) {
      // Split into chunks
      for (let i = 0; i < response.length; i += 4000) {
        await ctx.reply(response.substring(i, i + 4000));
      }
    } else {
      await ctx.reply(response);
    }
  } catch (err) {
    logger.error('CHAT_FAILED', { userId, error: err.message, stack: err.stack });
    await ctx.reply('Sorry, I had trouble processing that. Try again or send /help for options.');
  }
}

// ============================================================================
// SLASH COMMAND HANDLERS (still supported)
// ============================================================================

/**
 * /start - Welcome message
 */
async function handleStartCommand(ctx, userId) {
  const name = ctx.from?.first_name || ctx.from?.username || 'there';
  const welcomeMessage = `
🤖 *Hey ${name}! I'm MAX*

Your autonomous AI coding agent. I work like a normal chatbot — no commands needed.

*Just talk to me:*
• "build a snake game in HTML"
• "create a login page with React"
• "write a Python script to rename files"
• "how do I center a div in CSS?"

*I can also:*
• Clone a repo — "clone https://github.com/user/repo"
• Push changes — "push the changes to github"
• Show status — "what's my status?"
• Switch models — "change model"

Or use traditional commands: /help
  `.trim();

  await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
}

/**
 * /help - Full command list
 */
async function handleHelpCommand(ctx) {
  const helpMessage = `
📚 *How to use MAX*

*💬 Just talk to me naturally:*
• "build a snake game in HTML"
• "create a Python web scraper"
• "how do I use async/await in JavaScript?"
• "what's the best way to structure a React app?"

*🛠️ Or use these commands:*

*Repository:*
/repo [url] — Clone a GitHub repo
/push [msg] — Commit and push changes

*Tasks:*
/task [text] — Run a development task
/fix [text] — Fix an issue

*Config:*
/model — Select AI model
/status — Show session status
/cancel — Cancel running task

*💡 Pro tip:* You don't need commands! Just tell me what you want in plain English.
  `.trim();

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}

/**
 * /status - Current session status
 */
async function handleStatusCommand(ctx, userId) {
  try {
    const sessionId = await getOrCreateSession(userId, 'telegram');

    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    const msgCount = db.prepare('SELECT COUNT(*) as n FROM messages WHERE session_id = ?').get(sessionId)?.n || 0;
    const prefs = db.prepare('SELECT repo_owner, repo_name, preferred_model FROM user_preferences WHERE user_id = ?').get(String(userId));
    const lastRun = db.prepare('SELECT phase, status, started_at FROM agent_runs WHERE session_id = ? ORDER BY started_at DESC LIMIT 1').get(sessionId);

    const statusMessage = `
📊 *Status*

🆔 Session: \`${sessionId.substring(0, 8)}...\`
📨 Messages: ${msgCount}
🤖 Model: ${prefs?.preferred_model || 'default'}
📦 Repo: ${prefs?.repo_name ? `\`${prefs.repo_owner}/${prefs.repo_name}\`` : 'none'}
🔄 Last task: ${lastRun ? `${lastRun.phase} (${lastRun.status})` : 'none'}
✅ Telegram: connected
`.trim();

    await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error('STATUS_COMMAND_ERROR', { userId, error: err.message, stack: err.stack });
    await ctx.reply('❌ Failed to get status: ' + err.message);
  }
}

/**
 * /task - Execute development task
 */
async function handleTaskCommand(ctx, userId, text) {
  const taskText = text.replace('/task', '').trim();

  if (!taskText) {
    await ctx.reply('❌ Please describe what you want me to build.\n\nExample: /task Add a login page');
    return;
  }

  await ctx.reply('🚀 Starting: ' + taskText);

  try {
    const sessionId = await getOrCreateSession(userId, 'telegram');
    logger.info('TASK_STARTED', { userId, sessionId, task: taskText.substring(0, 100) });

    // Load preferred model
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const prefs = db.prepare('SELECT preferred_model FROM user_preferences WHERE user_id = ?').get(String(userId));
    if (prefs?.preferred_model) {
      try {
        const { setProvider } = await import('../llm/adapter.js');
        setProvider(prefs.preferred_model);
        logger.info('TASK_USING_PREFERRED_MODEL', { userId, model: prefs.preferred_model });
      } catch (e) {
        logger.warn('Failed to set preferred model', { error: e.message });
      }
    }

    await addMessage(sessionId, 'user', taskText);
    const results = await executeReActLoop(taskText, sessionId, userId, {
      workspacePath: process.env.SANDBOX_WORKSPACE || './sandbox-workspace'
    });

    // Build summary from ReAct loop results
    let summary = '';
    if (results?.success) {
      summary = '✅ ' + (results.summary || 'Task complete');
    } else {
      summary = '⚠️ ' + (results.summary || results?.error || 'Task failed');
    }

    if (results?.filesModified?.length > 0) {
      summary += '\n\nFiles written:\n' + results.filesModified.map(f => '  • ' + f).join('\n');
    }
    summary += '\n\nIterations: ' + (results.iterations || 0) + '/15';
    await ctx.reply(summary);
  } catch (err) {
    logger.error('TASK_FAILED', { userId, task: taskText, error: err.message, stack: err.stack });
    await ctx.reply('❌ Failed: ' + err.message);
  }
}

/**
 * /fix - Execute fix task (auto-prefixed)
 */
async function handleFixCommand(ctx, userId, text) {
  const fixText = text.replace('/fix', '').trim();
  if (!fixText) {
    await ctx.reply('❌ Please describe what to fix.');
    return;
  }
  await handleTaskCommand(ctx, userId, '/task fix: ' + fixText);
}

/**
 * /repo <url> — Clone a GitHub repo
 */
async function handleRepoCloneCommand(ctx, userId, text) {
  const url = text.replace('/repo', '').trim();

  if (!url) {
    await ctx.reply(
      '📦 *Clone a Repository*\n\n' +
      'Usage: `/repo <github-url>`\n\n' +
      'Or just say: "clone https://github.com/user/repo"\n\n' +
      'Examples:\n' +
      '`/repo https://github.com/amiahaking-wq/Maxxxxx`\n' +
      '`/repo https://github.com/user/project.git`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await ctx.reply('📦 Cloning repository...\n`' + url + '`', { parse_mode: 'Markdown' });

  try {
    const { execSync } = await import('child_process');
    const path = await import('path');
    const fs = await import('fs');

    const repoName = url.replace(/\.git$/, '').split('/').pop() || 'cloned-repo';
    const sandboxBase = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
    const cloneTarget = path.resolve(sandboxBase, repoName);

    if (fs.existsSync(cloneTarget)) {
      fs.rmSync(cloneTarget, { recursive: true, force: true });
    }
    fs.mkdirSync(sandboxBase, { recursive: true });

    let cloneUrl = url;
    if (process.env.GITHUB_TOKEN && url.startsWith('https://github.com/')) {
      cloneUrl = url.replace('https://', `https://x-access-token:${process.env.GITHUB_TOKEN}@`);
    }

    logger.info('Cloning repo', { url, repoName, cloneTarget });

    execSync(`git clone --depth 1 "${cloneUrl}" "${cloneTarget}"`, {
      stdio: 'pipe',
      timeout: 120000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });

    const files = execSync(`find "${cloneTarget}" -type f -not -path '*/.git/*' | wc -l`, {
      encoding: 'utf-8'
    }).trim();

    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    db.prepare(`
      INSERT INTO user_preferences (user_id, repo_owner, repo_name, preferred_model, updated_at)
      VALUES (?, ?, ?, COALESCE((SELECT preferred_model FROM user_preferences WHERE user_id = ?), NULL), ?)
      ON CONFLICT(user_id) DO UPDATE SET
        repo_owner = excluded.repo_owner,
        repo_name = excluded.repo_name,
        updated_at = excluded.updated_at
    `).run(String(userId), url.split('/')[3] || '', repoName, String(userId), new Date().toISOString());

    process.env.SANDBOX_WORKSPACE = cloneTarget;
    process.env.WORKSPACE_PATH = cloneTarget;

    try {
      const { invalidateWorkspace } = await import('../agent/phases/plan.js');
      const sessionId = await getOrCreateSession(userId, 'telegram');
      invalidateWorkspace(sessionId);
    } catch (e) { /* non-fatal */ }

    await ctx.reply(
      `✅ *Repository cloned!*\n\n` +
      `📁 Repo: \`${repoName}\`\n` +
      `📂 Path: \`${cloneTarget}\`\n` +
      `📄 Files: ${files}\n\n` +
      `Now just tell me what to do with it — e.g. "add a login page"`,
      { parse_mode: 'Markdown' }
    );

    logger.info('REPO_CLONED', { userId, repoName, cloneTarget, fileCount: files });
  } catch (err) {
    logger.error('REPO_CLONE_FAILED', { userId, url, error: err.message, stack: err.stack });
    await ctx.reply(`❌ Clone failed: \`${err.message}\``, { parse_mode: 'Markdown' });
  }
}

/**
 * /push [commit message] — Commit and push changes
 */
async function handlePushCommand(ctx, userId, text) {
  const commitMessage = text.replace('/push', '').trim() || 'MAX autonomous commit';

  try {
    const { execSync } = await import('child_process');
    const sandboxBase = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

    try {
      execSync('git rev-parse --git-dir', { cwd: sandboxBase, stdio: 'pipe' });
    } catch (e) {
      await ctx.reply('❌ No git repo in workspace.\n\nClone one first: `/repo <url>`', { parse_mode: 'Markdown' });
      return;
    }

    if (!process.env.GITHUB_TOKEN) {
      await ctx.reply('⚠️ GITHUB_TOKEN not set. Set it in environment to enable /push.', { parse_mode: 'Markdown' });
      return;
    }

    await ctx.reply('📤 Committing and pushing...');

    execSync('git config user.name "MAX Agent"', { cwd: sandboxBase, stdio: 'pipe' });
    execSync('git config user.email "max@autonomous-agent.dev"', { cwd: sandboxBase, stdio: 'pipe' });
    execSync('git add -A', { cwd: sandboxBase, stdio: 'pipe' });

    let hasChanges = true;
    try {
      execSync('git diff --cached --quiet', { cwd: sandboxBase, stdio: 'pipe' });
      hasChanges = false;
    } catch (e) {
      hasChanges = true;
    }

    if (!hasChanges) {
      await ctx.reply('ℹ️ No changes to commit.');
      return;
    }

    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}\n\nCo-Authored-By: MAX Agent <max@autonomous-agent.dev>"`, {
      cwd: sandboxBase,
      stdio: 'pipe'
    });

    execSync('git push origin HEAD', {
      cwd: sandboxBase,
      stdio: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: 60000
    });

    const hash = execSync('git rev-parse --short HEAD', { cwd: sandboxBase, encoding: 'utf-8' }).trim();

    await ctx.reply(
      `✅ *Pushed to GitHub!*\n\n📝 Commit: \`${hash}\`\n💬 Message: ${commitMessage}`,
      { parse_mode: 'Markdown' }
    );

    logger.info('REPO_PUSHED', { userId, commitMessage, hash });
  } catch (err) {
    logger.error('REPO_PUSH_FAILED', { userId, error: err.message, stack: err.stack });
    await ctx.reply(`❌ Push failed: \`${err.message}\``, { parse_mode: 'Markdown' });
  }
}

// ============================================================================
// OTHER COMMAND HANDLERS (existing implementations)
// ============================================================================

async function handleReposCommand(ctx, userId, text) {
  try {
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const userPref = db.prepare(`
      SELECT repo_owner, repo_name FROM user_preferences WHERE user_id = ?
    `).get(String(userId));

    await ctx.reply('🔍 Fetching your repositories...');

    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated', per_page: 20
    });

    if (repos.length === 0) {
      await ctx.reply('No repositories found.');
      return;
    }

    const buttons = repos.slice(0, 10).map(repo => [
      Markup.button.callback(
        `${repo.name}${userPref && userPref.repo_name === repo.name ? ' ✓' : ''}`,
        `repo:select:${repo.owner.login}:${repo.name}`
      )
    ]);

    const keyboard = Markup.inlineKeyboard(buttons);
    const current = userPref ? `\`${userPref.repo_owner}/${userPref.repo_name}\`` : 'None selected';

    await ctx.reply(
      `📦 *Select Repository*\n\nCurrent: ${current}\n\nChoose a repository:`,
      { parse_mode: 'Markdown', ...keyboard }
    );
  } catch (err) {
    logger.error('REPOS_COMMAND_ERROR', { userId, error: err.message });
    await ctx.reply('❌ Failed to fetch repositories: ' + err.message);
  }
}

/**
 * /model - Show model selection (only configured providers)
 */
async function handleModelCommand(ctx, userId) {
  const availableProviders = new Set();
  if (process.env.GROQ_API_KEY) availableProviders.add('groq');
  if (process.env.ANTHROPIC_API_KEY) availableProviders.add('anthropic');
  if (process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY) availableProviders.add('gemini');
  if (process.env.OPENAI_API_KEY) availableProviders.add('openai');
  if (process.env.OPENAI_COMPATIBLE_BASE_URL) availableProviders.add('openai-compatible');
  if (process.env.OLLAMA_HOST) availableProviders.add('ollama');
  if (process.env.LOCAL_API_BASE_URL) availableProviders.add('local');
  if (process.env.PHONE_SECRET) availableProviders.add('phone');
  if (process.env.ECHO_PROVIDER_ENABLED === 'true') availableProviders.add('echo');

  const allButtons = [
    { id: 'openrouter-kimi',  label: 'Kimi K2 🧠',           provider: 'openai-compatible' },
    { id: 'openrouter-glm',   label: 'GLM-4.5 ⚡',           provider: 'openai-compatible' },
    { id: 'openrouter-llama', label: 'Llama 3.3 70B (OR) ⚡', provider: 'openai-compatible' },
    { id: 'openai-compatible',label: 'Custom OpenRouter 🔌',  provider: 'openai-compatible' },
    { id: 'gemini-pro',       label: 'Gemini 2.5 Pro 🧠',  provider: 'gemini' },
    { id: 'gemini-flash',     label: 'Gemini 2.5 Flash ⚡', provider: 'gemini' },
    { id: 'groq-llama-70b',   label: 'Llama 3.3 70B (Groq) ⚡', provider: 'groq' },
    { id: 'groq-llama-8b',    label: 'Llama 3.1 8B (Groq) ⚡⚡', provider: 'groq' },
    { id: 'anthropic-sonnet', label: 'Claude Sonnet 🧠',   provider: 'anthropic' },
    { id: 'openai-gpt4o',     label: 'GPT-4o 🧠',          provider: 'openai' },
    { id: 'openai-gpt4o-mini',label: 'GPT-4o Mini ⚡',     provider: 'openai' },
    { id: 'ollama',           label: 'Ollama (local) 🖥️',   provider: 'ollama' },
    { id: 'phone',            label: 'Phone (Termux) 📱',   provider: 'phone' }
  ];

  const visibleButtons = allButtons.filter(b => availableProviders.has(b.provider));

  if (visibleButtons.length === 0) {
    await ctx.reply('⚠️ No LLM providers configured. Set GROQ_API_KEY, GOOGLE_GEMINI_API_KEY, PHONE_SECRET, or ECHO_PROVIDER_ENABLED in .env');
    return;
  }

  const rows = [];
  for (let i = 0; i < visibleButtons.length; i += 2) {
    const row = [Markup.button.callback(visibleButtons[i].label, `model:${visibleButtons[i].id}`)];
    if (visibleButtons[i + 1]) {
      row.push(Markup.button.callback(visibleButtons[i + 1].label, `model:${visibleButtons[i + 1].id}`));
    }
    rows.push(row);
  }

  const keyboard = Markup.inlineKeyboard(rows);

  const { getDatabase } = await import('../database/db.js');
  const db = getDatabase();
  const prefs = db.prepare('SELECT preferred_model FROM user_preferences WHERE user_id = ?').get(String(userId));
  const current = prefs?.preferred_model ? `Current: \`${prefs.preferred_model}\`` : 'Current: default';

  await ctx.reply(
    '🤖 *Select AI Model*\n\n' + current + '\n\nChoose:',
    { parse_mode: 'Markdown', ...keyboard }
  );
}

async function handleAgentsCommand(ctx, userId) {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🏗 Architect', 'agent:architect'), Markup.button.callback('⚙️ Engineer', 'agent:engineer')],
    [Markup.button.callback('🚀 DevOps', 'agent:devops'), Markup.button.callback('🎨 Media', 'agent:media')]
  ]);
  await ctx.reply('👥 *Select Agent Role*:', { parse_mode: 'Markdown', ...keyboard });
}

async function handleCancelCommand(ctx, userId) {
  await ctx.reply('✅ Cancelled. Send me a new message anytime.');
}

async function handleLogsCommand(ctx, text) {
  await ctx.reply('📝 Logs are available in the Railway dashboard or server console.');
}

async function handleReviewPRCommand(ctx, userId, text) {
  const prNumber = text.replace('/review_pr', '').trim();
  if (!prNumber) {
    await ctx.reply('❌ Please provide a PR number: /review_pr 42');
    return;
  }
  await ctx.reply(`📋 Reviewing PR #${prNumber}... (feature coming soon)`);
}

// ============================================================================
// CALLBACK HANDLER (for inline keyboards)
// ============================================================================

export async function handleTelegramCallback(ctx) {
  const callbackData = ctx.callbackQuery?.data || '';
  const userId = ctx.callbackQuery?.from?.id;

  logger.info('TG_CALLBACK', { userId, data: callbackData });

  try {
    if (callbackData.startsWith('model:')) {
      const modelId = callbackData.replace('model:', '');
      const model = getModelById(modelId);

      if (model) {
        const { getDatabase } = await import('../database/db.js');
        const db = getDatabase();
        db.prepare(`
          INSERT INTO user_preferences (user_id, preferred_model, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            preferred_model = excluded.preferred_model,
            updated_at = excluded.updated_at
        `).run(String(userId), model.id, new Date().toISOString());

        // For OpenRouter models, also set the model name on the provider
        try {
          const { setProvider, setModel } = await import('../llm/adapter.js');
          setProvider(model.id);
          // If this is an OpenRouter model, also update the provider's model
          if (model.provider === 'openai-compatible' && model.model) {
            setModel(model.model);
          }
        } catch (e) {
          logger.warn('Failed to set adapter provider on model select', { error: e.message });
          await ctx.reply(
            '⚠️ Could not switch to ' + model.name + '.\n\n' +
            'Error: ' + e.message + '\n\n' +
            'This usually means the provider is not configured.\n' +
            'For OpenRouter models, set these in Railway:\n' +
            '  OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1\n' +
            '  OPENAI_COMPATIBLE_API_KEY=sk-or-your-key\n' +
            '  OPENAI_COMPATIBLE_MODEL=meta-llama/llama-3.3-70b-instruct:free'
          );
          return;
        }

        await ctx.answerCbQuery();
        await ctx.reply(
          `✅ Model: *${model.name}*\nProvider: ${model.provider}\nContext: ${(model.contextWindow || 0).toLocaleString()} tokens`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.answerCbQuery('Unknown model');
      }
    } else if (callbackData.startsWith('agent:')) {
      const agentRole = callbackData.replace('agent:', '');
      await ctx.answerCbQuery();
      await ctx.reply(`✅ Agent role: ${agentRole}`);
    } else if (callbackData.startsWith('repo:select:')) {
      const parts = callbackData.split(':');
      const owner = parts[2];
      const repo = parts[3];

      const { getDatabase } = await import('../database/db.js');
      const db = getDatabase();
      db.prepare(`
        INSERT INTO user_preferences (user_id, repo_owner, repo_name, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          repo_owner = excluded.repo_owner,
          repo_name = excluded.repo_name,
          updated_at = excluded.updated_at
      `).run(String(userId), owner, repo, new Date().toISOString());

      await ctx.answerCbQuery();
      await ctx.reply(`✅ Selected: \`${owner}/${repo}\``, { parse_mode: 'Markdown' });
      logger.info('REPO_SELECTED', { userId, owner, repo });
    }
  } catch (err) {
    logger.error('TG_CALLBACK_ERROR', { error: err.message, data: callbackData });
    await ctx.answerCbQuery('Error: ' + err.message);
  }
}

export default {
  handleTelegramMessage,
  handleTelegramCallback
};

// ============================================================================
// STAGE 6 + 7 + 8 COMMAND HANDLERS
// ============================================================================

/**
 * /watch <url> — set up a watchdog rule to monitor a URL or repo
 */
async function handleWatchCommand(ctx, userId, url) {
  if (!url) {
    await ctx.reply('Usage: /watch <url>\nExample: /watch https://api.example.com/health');
    return;
  }
  try {
    const { default: watchdog } = await import('../watchdog/watchdog.js');
    const id = watchdog.addRule({
      user_id: String(userId),
      name: url.substring(0, 50),
      url,
      watch_type: 'api_change',
      check_interval_hours: 24
    });
    await ctx.reply('👁 Watching: ' + url + '\nRule ID: ' + id + '\nI\'ll check every 24h and report changes.');
  } catch (e) {
    await ctx.reply('❌ Failed to set up watch: ' + e.message);
  }
}

/**
 * /unwatch <id> — remove a watchdog rule
 */
async function handleUnwatchCommand(ctx, userId, id) {
  if (!id) {
    await ctx.reply('Usage: /unwatch <rule-id>');
    return;
  }
  try {
    const { default: watchdog } = await import('../watchdog/watchdog.js');
    const ok = watchdog.deleteRule(parseInt(id, 10));
    await ctx.reply(ok ? '✅ Stopped watching rule ' + id : 'Rule not found');
  } catch (e) {
    await ctx.reply('❌ Failed: ' + e.message);
  }
}

/**
 * /rules — list all watchdog rules
 */
async function handleRulesCommand(ctx, userId) {
  try {
    const { default: watchdog } = await import('../watchdog/watchdog.js');
    const rules = watchdog.listRules();
    if (!rules.length) {
      await ctx.reply('No watchdog rules. Use /watch <url> to start.');
      return;
    }
    const text = '👁 Watchdog Rules:\n\n' + rules.map(r =>
      `#${r.id} — ${r.name}\n  URL: ${r.url || 'none'}\n  Type: ${r.watch_type}\n  Active: ${r.is_active ? '✓' : '✗'}\n  Last checked: ${r.last_checked_at || 'never'}`
    ).join('\n\n');
    await ctx.reply(text);
  } catch (e) {
    await ctx.reply('❌ Failed: ' + e.message);
  }
}

/**
 * /share — generate a shareable link to the current session
 */
async function handleShareCommand(ctx, userId) {
  const sessionId = 'tg_' + userId + '_' + Date.now();
  const shareUrl = 'https://maxxxxx-production.up.railway.app/?session=' + sessionId;
  await ctx.reply('🔗 Share this link to collaborate in real-time:\n' + shareUrl);
}

/**
 * /cs_setup — walk the user through setting up customer service mode
 */
async function handleCsSetupCommand(ctx, userId, text) {
  const parts = text.split('\n').slice(1).join(' ').trim();
  // If no args, show instructions
  if (!parts || parts === '/cs_setup') {
    await ctx.reply(
      '🤖 Customer Service Setup\n\n' +
      'Send me your business details in this format:\n\n' +
      '/cs_setup\n' +
      'Business name: Yummmy Taste\n' +
      'Business type: restaurant\n' +
      'Agent name: MAX\n' +
      'Agent personality: friendly, professional\n' +
      'Language: English\n' +
      'Escalation contact: owner@example.com\n' +
      'Working hours: Mon-Sat 8am-6pm\n' +
      'Telegram notify ID: ' + userId + '\n\n' +
      'After setup, other bots can forward customer messages to:\n' +
      'POST https://maxxxxx-production.up.railway.app/api/cs/message\n\n' +
      'Use /cs_status to check your setup, /cs_disable to turn off.'
    );
    return;
  }

  // Parse the multi-line input
  const lines = parts.split('\n');
  const profile = {};
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      const value = match[2].trim();
      profile[key] = value;
    }
  }

  if (!profile.business_name) {
    await ctx.reply('❌ Business name is required. Use the format shown by /cs_setup');
    return;
  }

  try {
    const { saveBusinessProfile } = await import('../modes/customer-service.js');
    const saved = saveBusinessProfile(String(userId), {
      business_name: profile.business_name,
      business_type: profile.business_type,
      agent_name: profile.agent_name || 'MAX',
      agent_personality: profile.agent_personality || 'friendly, professional, helpful',
      language: profile.language || 'English',
      escalation_contact: profile.escalation_contact,
      working_hours: profile.working_hours,
      telegram_notify_id: profile.telegram_notify_id || String(userId)
    });
    await ctx.reply(
      '✅ Customer service mode activated!\n\n' +
      'Business: ' + saved.business_name + '\n' +
      'Agent: ' + (saved.agent_name || 'MAX') + '\n' +
      'Type: ' + (saved.business_type || 'general') + '\n\n' +
      'Other bots can now forward customer messages to:\n' +
      'POST /api/cs/message\n' +
      'Body: { businessOwnerId: "' + userId + '", customerId: "...", message: "..." }\n\n' +
      'Use /knowledge_add to add your business policies and FAQs so MAX can answer accurately.'
    );
  } catch (e) {
    await ctx.reply('❌ Setup failed: ' + e.message);
  }
}

/**
 * /cs_status — show current customer service configuration
 */
async function handleCsStatusCommand(ctx, userId) {
  try {
    const { getActiveBusinessProfile, listBusinessProfiles } = await import('../modes/customer-service.js');
    const active = getActiveBusinessProfile(String(userId));
    if (!active) {
      await ctx.reply('Customer service mode is not active. Use /cs_setup to configure.');
      return;
    }
    await ctx.reply(
      '🤖 Customer Service Status\n\n' +
      'Business: ' + active.business_name + '\n' +
      'Agent: ' + (active.agent_name || 'MAX') + '\n' +
      'Type: ' + (active.business_type || 'general') + '\n' +
      'Language: ' + (active.language || 'English') + '\n' +
      'Working hours: ' + (active.working_hours || 'not set') + '\n' +
      'Escalation: ' + (active.escalation_contact || 'not set') + '\n' +
      'Active: ' + (active.is_active ? '✓' : '✗')
    );
  } catch (e) {
    await ctx.reply('❌ Failed: ' + e.message);
  }
}

/**
 * /cs_disable — turn off customer service mode
 */
async function handleCsDisableCommand(ctx, userId) {
  try {
    const { saveBusinessProfile, getActiveBusinessProfile } = await import('../modes/customer-service.js');
    const active = getActiveBusinessProfile(String(userId));
    if (!active) {
      await ctx.reply('Customer service mode is not active.');
      return;
    }
    saveBusinessProfile(String(userId), { ...active, is_active: false });
    await ctx.reply('✅ Customer service mode disabled. Use /cs_setup to re-enable.');
  } catch (e) {
    await ctx.reply('❌ Failed: ' + e.message);
  }
}

/**
 * /knowledge_add <text> — add a document to the knowledge base
 */
async function handleKnowledgeAddCommand(ctx, userId, payload) {
  if (!payload || payload.length < 10) {
    await ctx.reply(
      'Usage: /knowledge_add <text>\n\n' +
      'Example:\n' +
      '/knowledge_add Our refund policy is 7 days for all products. No refunds on digital items.\n\n' +
      'Or send: /knowledge_add title=Refund Policy | content=Our refund policy is 7 days...'
    );
    return;
  }

  // Parse "title=X | content=Y" format if present, otherwise use the whole thing as content
  let title, content;
  if (payload.includes('|') && payload.toLowerCase().includes('title=')) {
    const parts = payload.split('|');
    for (const part of parts) {
      const m = part.match(/^title=\s*(.+)$/i);
      if (m) title = m[1].trim();
      const m2 = part.match(/^content=\s*(.+)$/i);
      if (m2) content = m2[1].trim();
    }
  }
  if (!title) {
    title = payload.substring(0, 50) + (payload.length > 50 ? '...' : '');
    content = payload;
  }

  try {
    const { knowledgeStore } = await import('../rag/knowledge-store.js');
    const result = await knowledgeStore.addDocument(String(userId), { title, content, type: 'policy', source: 'telegram' });
    await ctx.reply('📚 ' + result);
  } catch (e) {
    await ctx.reply('❌ Knowledge base not available: ' + e.message + '\n\nMake sure Supabase pgvector is set up (run sql/pgvector-setup.sql) and @xenova/transformers is installed.');
  }
}

/**
 * /knowledge_list — list all documents in the knowledge base
 */
async function handleKnowledgeListCommand(ctx, userId) {
  try {
    const { knowledgeStore } = await import('../rag/knowledge-store.js');
    const docs = await knowledgeStore.list(String(userId));
    if (!docs.length) {
      await ctx.reply('Knowledge base is empty. Use /knowledge_add to add documents.');
      return;
    }
    const text = '📚 Knowledge Base:\n\n' + docs.map(d =>
      '- [' + (d.content_type || 'document') + '] ' + d.title + ' (' + (d.created_at ? String(d.created_at).split('T')[0] : 'unknown') + ')'
    ).join('\n');
    await ctx.reply(text);
  } catch (e) {
    await ctx.reply('❌ Failed: ' + e.message);
  }
}

/**
 * /credentials — list all saved credentials (without passwords)
 */
async function handleCredentialsListCommand(ctx, userId) {
  try {
    const { credentialVault } = await import('../security/credential-vault.js');
    const list = credentialVault.list(String(userId));
    if (!list.length) {
      await ctx.reply('No credentials saved. Ask MAX to save some (e.g. "save my Jumia login: user@test.com / pass123").');
      return;
    }
    const text = '🔐 Saved Credentials:\n\n' + list.map(c =>
      '- ' + c.service_name + ' (user: ' + (c.username || 'none') + ', password: ' + c.password_status + ', api_key: ' + c.api_key_status + ')'
    ).join('\n');
    await ctx.reply(text);
  } catch (e) {
    await ctx.reply('❌ Failed: ' + e.message);
  }
}

/**
 * /permissions — show current permission grants
 */
async function handlePermissionsCommand(ctx, userId) {
  try {
    const { permissionGuard } = await import('../security/permission-guard.js');
    const logs = permissionGuard.listAuditLog(String(userId), 10);
    let text = '🛡️ Recent Actions (audit log):\n\n';
    if (!logs.length) {
      text += 'No actions logged yet.';
    } else {
      text += logs.map(l =>
        '[' + l.timestamp + '] ' + l.tool_name + (l.was_destructive ? ' ⚠️' : '') + (l.required_confirmation ? ' (confirmed)' : '')
      ).join('\n');
    }
    text += '\n\nTo grant more permissions, tell me:\n"allow MAX to git_push"\n"allow MAX to external_api"\n"allow MAX to browser_write"';
    await ctx.reply(text);
  } catch (e) {
    await ctx.reply('❌ Failed: ' + e.message);
  }
}

// ============================================================================
// TELEGRAM ACCOUNT LINKING
// ============================================================================

/**
 * /link <code> — link this Telegram account to a website account
 * 
 * Flow:
 * 1. User logs into the website
 * 2. Goes to Settings → Profile → "Link Telegram"
 * 3. Website generates a 6-char code (e.g. ABC123)
 * 4. User sends /link ABC123 to the Telegram bot
 * 5. Bot links the Telegram user ID to the website user ID
 * 6. From now on, Telegram messages use the same user ID as the website
 *    → shared conversations, memories, knowledge base, credentials
 */
async function handleLinkCommand(ctx, telegramUserId, telegramUsername, code) {
  if (!code) {
    // Check if already linked
    try {
      const { getDatabase } = await import('../database/db.js');
      const db = getDatabase();
      const existing = db.prepare('SELECT * FROM max_telegram_links WHERE telegram_user_id = ?').get(telegramUserId);
      if (existing) {
        await ctx.reply(
          '✅ Your Telegram is already linked to your website account.\n\n' +
          'Linked since: ' + existing.linked_at + '\n\n' +
          'Use /unlink to remove the link.'
        );
      } else {
        await ctx.reply(
          '🔗 **Link Your Telegram to MAX Website**\n\n' +
          'To link your Telegram account to your website account:\n\n' +
          '1. Log in to https://maxxxxx-production.up.railway.app\n' +
          '2. Go to Settings → Profile\n' +
          '3. Click "Link Telegram"\n' +
          '4. Copy the 6-character code\n' +
          '5. Send it here: /link ABC123\n\n' +
          'Once linked, your conversations, memories, and settings are shared between web and Telegram.'
        );
      }
    } catch (e) {
      await ctx.reply('Usage: /link <code>\nGet your code from the website Settings → Profile → Link Telegram');
    }
    return;
  }

  // Validate the code
  code = code.toUpperCase().trim();
  try {
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();

    // Check if code exists and is valid
    const codeRow = db.prepare('SELECT * FROM max_telegram_codes WHERE code = ? AND used = 0').get(code);
    if (!codeRow) {
      await ctx.reply('❌ Invalid or already used code. Generate a new one from the website Settings → Profile → Link Telegram.');
      return;
    }

    // Check if code is expired
    const expiresAt = new Date(codeRow.expires_at);
    if (expiresAt < new Date()) {
      await ctx.reply('❌ This code has expired. Generate a new one from the website Settings → Profile → Link Telegram.');
      return;
    }

    // Check if this Telegram account is already linked to a different user
    const existingLink = db.prepare('SELECT * FROM max_telegram_links WHERE telegram_user_id = ?').get(telegramUserId);
    if (existingLink && existingLink.user_id !== codeRow.user_id) {
      await ctx.reply('❌ This Telegram account is already linked to a different website account. Use /unlink first.');
      return;
    }

    // Link the Telegram account to the website user
    db.prepare('INSERT OR REPLACE INTO max_telegram_links (user_id, telegram_user_id, telegram_username) VALUES (?, ?, ?)')
      .run(codeRow.user_id, telegramUserId, telegramUsername);

    // Mark code as used
    db.prepare('UPDATE max_telegram_codes SET used = 1 WHERE code = ?').run(code);

    logger.info('TELEGRAM_LINKED', { telegramUserId, telegramUsername, websiteUserId: codeRow.user_id });

    await ctx.reply(
      '✅ **Telegram linked successfully!**\n\n' +
      'Your Telegram account is now connected to your MAX website account.\n\n' +
      'From now on:\n' +
      '• Conversations are shared between web and Telegram\n' +
      '• Memories and knowledge base are shared\n' +
      '• Settings and permissions are shared\n' +
      '• Files created on either platform are accessible from both\n\n' +
      'Use /unlink to remove the link at any time.'
    );
  } catch (e) {
    logger.error('TELEGRAM_LINK_ERROR', { error: e.message });
    await ctx.reply('❌ Failed to link: ' + e.message);
  }
}

/**
 * /unlink — remove Telegram → website link
 */
async function handleUnlinkCommand(ctx, telegramUserId) {
  try {
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const result = db.prepare('DELETE FROM max_telegram_links WHERE telegram_user_id = ?').run(telegramUserId);
    if (result.changes > 0) {
      await ctx.reply('✅ Telegram unlinked. Your conversations are now separate from the website.');
    } else {
      await ctx.reply('Your Telegram was not linked to any website account.');
    }
  } catch (e) {
    await ctx.reply('❌ Failed: ' + e.message);
  }
}
