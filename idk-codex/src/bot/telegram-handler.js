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
import { executeAgentLoop } from '../agent/loop.js';
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
  if (lower.startsWith('/logs')) return { intent: 'logs' };
  if (lower.startsWith('/review_pr')) return { intent: 'review_pr', payload: t.replace('/review_pr', '').trim() };

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

  // Task detection — coding/development requests
  // These keywords strongly suggest the user wants MAX to DO something
  const taskKeywords = [
    'build', 'create', 'make', 'write', 'generate', 'implement', 'develop',
    'add', 'fix', 'refactor', 'update', 'modify', 'edit', 'change',
    'design', 'setup', 'set up', 'configure', 'deploy',
    'write a', 'create a', 'build a', 'make a', 'generate a',
    'write me', 'create me', 'build me', 'make me',
    'code', 'function', 'component', 'page', 'app', 'script',
    'api', 'endpoint', 'route', 'database', 'schema',
    'html', 'css', 'javascript', 'python', 'react', 'node',
    'bug', 'error', 'broken', 'not working', 'failing',
    'test', 'feature', 'login', 'signup', 'dashboard',
    'landing page', 'website', 'web app', 'backend', 'frontend'
  ];

  // A message is a task if:
  // 1. It's longer than 15 chars (not just "hi" or "ok")
  // 2. It contains a task keyword OR looks like an instruction
  const isLongEnough = t.length > 15;
  const hasTaskKeyword = taskKeywords.some(kw => lower.includes(kw));
  const looksLikeInstruction = /^(can you|could you|please|hey max|max,? |i need|i want|let's|lets)/i.test(t);
  const hasImperativeVerb = /^(build|create|make|write|generate|fix|add|remove|delete|update|refactor|deploy|run|test|install|set up|configure)/i.test(t);

  if (isLongEnough && (hasTaskKeyword || looksLikeInstruction || hasImperativeVerb)) {
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
  const userId = ctx.from?.id;
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
      case 'logs':
        await handleLogsCommand(ctx, text);
        break;
      case 'review_pr':
        await handleReviewPRCommand(ctx, userId, '/review_pr ' + (payload || ''));
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
    const results = await executeAgentLoop(taskText, sessionId, null, userId);

    // Build summary
    let summary = '';
    const planOk = results?.plan?.success === true;
    const execOk = results?.execute?.success === true;
    const filesWritten = results?.execute?.filesModified || [];
    const testOk = results?.test?.success === true;
    const testSkipped = results?.test?.skipped === true;
    const deployOk = results?.deploy?.success === true;
    const deploySkipped = results?.deploy?.skipped === true;
    const validationFailed = results?.validationFailed === true;

    if (results?.success) {
      summary = '✅ Task complete!\n\n';
    } else if (execOk && filesWritten.length > 0) {
      summary = '✅ Task complete (files written).\n\n';
      if (validationFailed) {
        summary += 'ℹ️ Validation skipped (no test infrastructure). File was still written.\n\n';
      } else if (!deployOk && !deploySkipped) {
        summary += 'ℹ️ Deploy phase failed (normal in fresh sandbox).\n\n';
      }
    } else if (results?.needsClarification) {
      summary = '💬 ' + (results.clarificationMenu || 'Task needs clarification.');
    } else {
      summary = '⚠️ Task finished with errors.\n\n';
      summary += 'Error: ' + (results?.error || 'unknown') + '\n\n';
      if (!planOk) summary += 'Plan phase: ' + (results?.plan?.error || 'failed') + '\n';
      if (!execOk) summary += 'Execute phase: ' + (results?.execute?.error || 'failed') + '\n';
    }

    summary += 'Phases: ' + (planOk ? '✓' : '✗') + ' plan · ' + (execOk ? '✓' : '✗') + ' execute · ' + (testOk ? '✓' : (testSkipped ? '⊘' : '✗')) + ' test · ' + (deployOk ? '✓' : (deploySkipped ? '⊘' : '✗')) + ' deploy\n';
    if (filesWritten.length > 0) {
      summary += '\nFiles written:\n' + filesWritten.map(f => '  • ' + f).join('\n');
    }
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
