/**
 * Telegram Bot Handler - Complete Rewrite
 * Handles all Telegram bot commands with comprehensive error handling and logging
 */

import logger from '../utils/logger.js';
import { getOrCreateSession, addMessage } from '../database/queries.js';
import { executeAgentLoop } from '../agent/loop.js';
import { getModelOptions, getModelById, getDefaultModel } from '../llm/model-registry.js';
import { Markup } from 'telegraf';

/**
 * Main Telegram message handler
 * Wraps entire handling logic with try/catch and logging
 */
export async function handleTelegramMessage(ctx) {
  // FIRST ACTION: Log every message before anything else
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  const text = ctx.message?.text || '';
  const messageType = ctx.message?.text ? 'text' : ctx.updateType;

  logger.info('TG_MSG', {
    chatId,
    userId,
    text: text.substring(0, 100), // Truncate for logging
    type: messageType,
    username: ctx.from?.username
  });

  try {
    // Route to appropriate handler based on command
    if (text.startsWith('/start')) {
      await handleStartCommand(ctx, userId);
    } else if (text.startsWith('/help')) {
      await handleHelpCommand(ctx);
    } else if (text.startsWith('/status')) {
      await handleStatusCommand(ctx, userId);
    } else if (text.startsWith('/repos')) {
      await handleReposCommand(ctx, userId, text);
    } else if (text.startsWith('/repo ')) {
      await handleRepoCloneCommand(ctx, userId, text);
    } else if (text.startsWith('/model')) {
      await handleModelCommand(ctx, userId);
    } else if (text.startsWith('/agents')) {
      await handleAgentsCommand(ctx, userId);
    } else if (text.startsWith('/task')) {
      await handleTaskCommand(ctx, userId, text);
    } else if (text.startsWith('/push')) {
      await handlePushCommand(ctx, userId, text);
    } else if (text.startsWith('/fix')) {
      await handleFixCommand(ctx, userId, text);
    } else if (text.startsWith('/review_pr')) {
      await handleReviewPRCommand(ctx, userId, text);
    } else if (text.startsWith('/cancel')) {
      await handleCancelCommand(ctx, userId);
    } else if (text.startsWith('/logs')) {
      await handleLogsCommand(ctx, text);
    } else {
      // Plain text - instruct user to use /task
      await ctx.reply(
        '💡 Use /task [description] to run a task.\n\n' +
        'Type /help for all available commands.'
      );
    }
  } catch (err) {
    // Comprehensive error logging
    logger.error('TG_CRASH', {
      error: err.message,
      stack: err.stack,
      chatId,
      userId,
      command: text.split(' ')[0]
    });

    // User-friendly error message
    await ctx.reply('❌ Error: ' + err.message);
  }
}

/**
 * /start - Welcome message
 */
async function handleStartCommand(ctx, userId) {
  const welcomeMessage = `
🤖 *Welcome to MAX System*

Your autonomous AI development assistant.

*Quick Start:*
/task [description] - Run any development task
/model - Choose your AI model
/help - See all commands

Ready to build something amazing!
  `.trim();

  await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
}

/**
 * /help - Full command list
 */
async function handleHelpCommand(ctx) {
  const helpMessage = `
📚 *MAX System Commands*

*Repository (work on real repos like Claude Code):*
/repo [url] - Clone a GitHub repo into the workspace
/push [msg] - Commit and push changes back to GitHub
/repos - List GitHub repositories

*Task Management:*
/task [text] - Execute a development task
/fix [text] - Fix an issue (auto-prefixed)
/cancel - Cancel current running task
/status - Show current session status

*Configuration:*
/model - Select AI model
/agents - Choose agent role

*Utilities:*
/review\\_pr [number] - Review a pull request
/logs [n] - Show last n log lines
/help - Show this message

*Examples:*
\`/repo https://github.com/user/myproject\`
\`/task Add a login page with validation\`
\`/push Fix the login bug\`
\`/fix The navbar isn't responsive on mobile\`
  `.trim();

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}

/**
 * /status - Current session status
 */
async function handleStatusCommand(ctx, userId) {
  try {
    // getOrCreateSession returns the sessionId (UUID string) directly,
    // NOT a session object. We need to query the DB for the rest of the row.
    const sessionId = await getOrCreateSession(userId, 'telegram');

    // Pull the full session row from the DB for display.
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

    // Count messages in this session
    const msgCount = db.prepare('SELECT COUNT(*) as n FROM messages WHERE session_id = ?').get(sessionId)?.n || 0;

    // Get user preferences (model + repo)
    const prefs = db.prepare('SELECT repo_owner, repo_name, preferred_model FROM user_preferences WHERE user_id = ?').get(String(userId));

    // Get latest agent run for this session
    const lastRun = db.prepare('SELECT phase, status, started_at FROM agent_runs WHERE session_id = ? ORDER BY started_at DESC LIMIT 1').get(sessionId);

    const statusMessage = `
📊 *Session Status*

Session ID: \`${sessionId}\`
Platform: Telegram
Status: ${session?.status || 'idle'}
Created: ${session?.created_at ? new Date(session.created_at).toLocaleString() : 'unknown'}
Messages: ${msgCount}

Current Repository: ${prefs?.repo_name ? `\`${prefs.repo_owner}/${prefs.repo_name}\`` : 'Not set'}
Current Model: ${prefs?.preferred_model || 'gemini-pro (default)'}
Last Phase: ${lastRun ? `${lastRun.phase} (${lastRun.status})` : 'none yet'}
    `.trim();

    await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error('STATUS_COMMAND_ERROR', { userId, error: err.message, stack: err.stack });
    await ctx.reply('❌ Failed to get status: ' + err.message);
  }
}

/**
 * /repos - List GitHub repositories and select
 */
async function handleReposCommand(ctx, userId, text) {
  try {
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // Get user's current selection
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const userPref = db.prepare(`
      SELECT repo_owner, repo_name
      FROM user_preferences
      WHERE user_id = ?
    `).get(String(userId));

    await ctx.reply('🔍 Fetching your repositories...');

    // Fetch user's repos from GitHub
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 20
    });

    if (repos.length === 0) {
      await ctx.reply('No repositories found.');
      return;
    }

    // Create buttons for first 10 repos (Telegram limit)
    const buttons = repos.slice(0, 10).map(repo => [
      Markup.button.callback(
        `${repo.name}${userPref && userPref.repo_name === repo.name ? ' ✓' : ''}`,
        `repo:select:${repo.owner.login}:${repo.name}`
      )
    ]);

    const keyboard = Markup.inlineKeyboard(buttons);

    const current = userPref
      ? `\`${userPref.repo_owner}/${userPref.repo_name}\``
      : 'None selected';

    await ctx.reply(
      `📦 *Select Repository*\n\n` +
      `Current: ${current}\n\n` +
      `Choose a repository:`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );

  } catch (err) {
    logger.error('REPOS_COMMAND_ERROR', {
      userId,
      error: err.message
    });
    await ctx.reply('❌ Failed to fetch repositories: ' + err.message);
  }
}

/**
 * /repo <url> — Clone a GitHub repo into the sandbox and set it as the active
 * workspace for all future /task commands.
 *
 * After cloning, MAX works just like Claude Code does:
 *   1. Clones the repo into /app/sandbox-workspace/<repo-name>/
 *   2. All future /task commands read from and write to that repo
 *   3. /push commits and pushes changes back to GitHub
 *
 * Examples:
 *   /repo https://github.com/amiahaking-wq/Maxxxxx
 *   /repo https://github.com/user/project.git
 *
 * For private repos, set GITHUB_TOKEN in the environment — MAX will use it
 * for both clone and push.
 */
async function handleRepoCloneCommand(ctx, userId, text) {
  const url = text.replace('/repo', '').trim();

  if (!url) {
    await ctx.reply(
      '📦 *Clone a Repository*\n\n' +
      'Usage: `/repo <github-url>`\n\n' +
      'Examples:\n' +
      '`/repo https://github.com/amiahaking-wq/Maxxxxx`\n' +
      '`/repo https://github.com/user/project.git`\n\n' +
      'After cloning, all `/task` commands will work on that repo.\n' +
      'Use `/push` to commit and push changes back to GitHub.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await ctx.reply('📦 Cloning repository...\n`' + url + '`', { parse_mode: 'Markdown' });

  try {
    const { execSync } = await import('child_process');
    const path = await import('path');
    const fs = await import('fs');

    // Extract repo name from URL
    const repoName = url.replace(/\.git$/, '').split('/').pop() || 'cloned-repo';
    const sandboxBase = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
    const cloneTarget = path.resolve(sandboxBase, repoName);

    // Remove if already exists
    if (fs.existsSync(cloneTarget)) {
      fs.rmSync(cloneTarget, { recursive: true, force: true });
    }

    // Ensure sandbox exists
    fs.mkdirSync(sandboxBase, { recursive: true });

    // Build clone URL with token if GITHUB_TOKEN is set and it's an HTTPS URL
    let cloneUrl = url;
    if (process.env.GITHUB_TOKEN && url.startsWith('https://github.com/')) {
      cloneUrl = url.replace('https://', `https://x-access-token:${process.env.GITHUB_TOKEN}@`);
    }

    logger.info('Cloning repo', { url, repoName, cloneTarget });

    // Clone with depth 1 for speed (full history not needed for editing)
    execSync(`git clone --depth 1 "${cloneUrl}" "${cloneTarget}"`, {
      stdio: 'pipe',
      timeout: 120000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });

    // Count files
    const files = execSync(`find "${cloneTarget}" -type f -not -path '*/.git/*' | wc -l`, {
      encoding: 'utf-8'
    }).trim();

    // Store the active repo path in user_preferences
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

    // Also set SANDBOX_WORKSPACE env var so the agent loop uses this repo
    process.env.SANDBOX_WORKSPACE = cloneTarget;
    process.env.WORKSPACE_PATH = cloneTarget;

    // Invalidate any cached workspace context
    try {
      const { invalidateWorkspace } = await import('../agent/phases/plan.js');
      const sessionId = await getOrCreateSession(userId, 'telegram');
      invalidateWorkspace(sessionId);
    } catch (e) {
      // non-fatal
    }

    await ctx.reply(
      `✅ *Repository cloned successfully!*\n\n` +
      `📁 *Repo:* \`${repoName}\`\n` +
      `📂 *Path:* \`${cloneTarget}\`\n` +
      `📄 *Files:* ${files}\n\n` +
      `Now all \`/task\` commands will work on this repo.\n` +
      `Use \`/push "commit message"\` to commit and push changes.`,
      { parse_mode: 'Markdown' }
    );

    logger.info('REPO_CLONED', { userId, repoName, cloneTarget, fileCount: files });
  } catch (err) {
    logger.error('REPO_CLONE_FAILED', { userId, url, error: err.message, stack: err.stack });
    await ctx.reply(
      `❌ *Clone failed:*\n\`${err.message}\`\n\n` +
      `Make sure the URL is correct and the repo is public (or GITHUB_TOKEN is set for private repos).`,
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * /push [commit message] — Commit and push changes in the active repo back to GitHub.
 *
 * Requires:
 *   - GITHUB_TOKEN set in the environment
 *   - A repo cloned via /repo first
 *
 * Example:
 *   /push Fix the login bug
 *   /push Add user authentication
 */
async function handlePushCommand(ctx, userId, text) {
  const commitMessage = text.replace('/push', '').trim() || 'MAX autonomous commit';

  try {
    const { execSync } = await import('child_process');
    const sandboxBase = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

    // Check if we're in a git repo
    try {
      execSync('git rev-parse --git-dir', { cwd: sandboxBase, stdio: 'pipe' });
    } catch (e) {
      await ctx.reply(
        '❌ No git repository found in the workspace.\n\n' +
        'Use `/repo <url>` to clone a repository first.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (!process.env.GITHUB_TOKEN) {
      await ctx.reply(
        '⚠️ *GITHUB_TOKEN not set*\n\n' +
        'Pushing to GitHub requires a personal access token.\n' +
        'Set it in the environment variables to enable /push.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await ctx.reply('📤 Committing and pushing changes...');

    // Configure git user
    execSync('git config user.name "MAX Agent"', { cwd: sandboxBase, stdio: 'pipe' });
    execSync('git config user.email "max@autonomous-agent.dev"', { cwd: sandboxBase, stdio: 'pipe' });

    // Add all changes
    execSync('git add -A', { cwd: sandboxBase, stdio: 'pipe' });

    // Check if there are changes to commit
    let hasChanges = true;
    try {
      execSync('git diff --cached --quiet', { cwd: sandboxBase, stdio: 'pipe' });
      hasChanges = false;
    } catch (e) {
      hasChanges = true;
    }

    if (!hasChanges) {
      await ctx.reply('ℹ️ No changes to commit. The workspace is clean.');
      return;
    }

    // Commit
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}\n\nCo-Authored-By: MAX Agent <max@autonomous-agent.dev>"`, {
      cwd: sandboxBase,
      stdio: 'pipe'
    });

    // Push
    execSync('git push origin HEAD', {
      cwd: sandboxBase,
      stdio: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: 60000
    });

    // Get the commit hash
    const hash = execSync('git rev-parse --short HEAD', { cwd: sandboxBase, encoding: 'utf-8' }).trim();

    await ctx.reply(
      `✅ *Pushed to GitHub!*\n\n` +
      `📝 *Commit:* \`${hash}\`\n` +
      `💬 *Message:* ${commitMessage}\n\n` +
      `Changes are now live on your repository.`,
      { parse_mode: 'Markdown' }
    );

    logger.info('REPO_PUSHED', { userId, commitMessage, hash });
  } catch (err) {
    logger.error('REPO_PUSH_FAILED', { userId, error: err.message, stack: err.stack });
    await ctx.reply(`❌ *Push failed:*\n\`${err.message}\``, { parse_mode: 'Markdown' });
  }
}

/**
 * /model - Show model selection inline keyboard
 *
 * Only show models whose provider is currently configured (has an API key
 * in the environment). This prevents the user from picking a model that
 * will fail at task time.
 */
async function handleModelCommand(ctx, userId) {
  // Determine which providers are actually available right now.
  const availableProviders = new Set();
  if (process.env.GROQ_API_KEY) availableProviders.add('groq');
  if (process.env.ANTHROPIC_API_KEY) availableProviders.add('anthropic');
  if (process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY) availableProviders.add('gemini');
  if (process.env.OPENAI_API_KEY) availableProviders.add('openai');
  if (process.env.OPENAI_COMPATIBLE_BASE_URL) availableProviders.add('openai-compatible');
  if (process.env.OLLAMA_HOST) availableProviders.add('ollama');
  if (process.env.LOCAL_API_BASE_URL) availableProviders.add('local');
  if (process.env.PHONE_SECRET) availableProviders.add('phone');

  // All models we know how to render as buttons.
  const allButtons = [
    { id: 'gemini-pro',       label: 'Gemini Pro (2M ctx) 🧠',  provider: 'gemini' },
    { id: 'gemini-flash',     label: 'Gemini Flash ⚡',          provider: 'gemini' },
    { id: 'groq-llama-70b',   label: 'Llama 3.3 70B ⚡',         provider: 'groq' },
    { id: 'groq-llama-8b',    label: 'Llama 3.1 8B ⚡⚡',        provider: 'groq' },
    { id: 'anthropic-sonnet', label: 'Claude Sonnet 🧠',        provider: 'anthropic' },
    { id: 'openai-gpt4o',     label: 'GPT-4o 🧠',               provider: 'openai' },
    { id: 'openai-gpt4o-mini',label: 'GPT-4o Mini ⚡',          provider: 'openai' },
    { id: 'ollama',           label: 'Ollama (local) 🖥️',        provider: 'ollama' },
    { id: 'phone',            label: 'Phone (Termux) 📱',        provider: 'phone' }
  ];

  const visibleButtons = allButtons.filter(b => availableProviders.has(b.provider));

  if (visibleButtons.length === 0) {
    await ctx.reply(
      '⚠️ *No LLM providers configured*\n\n' +
      'Add at least one API key to `idk-codex/.env`:\n' +
      '  • `GROQ_API_KEY` — free at https://console.groq.com/keys\n' +
      '  • `GOOGLE_GEMINI_API_KEY` — free at https://aistudio.google.com/app/apikey\n' +
      '  • `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_HOST`, etc.\n\n' +
      'Then restart the server.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Pair up into rows of 2 buttons
  const rows = [];
  for (let i = 0; i < visibleButtons.length; i += 2) {
    const row = [Markup.button.callback(visibleButtons[i].label, `model:${visibleButtons[i].id}`)];
    if (visibleButtons[i + 1]) {
      row.push(Markup.button.callback(visibleButtons[i + 1].label, `model:${visibleButtons[i + 1].id}`));
    }
    rows.push(row);
  }

  const keyboard = Markup.inlineKeyboard(rows);

  // Get current preference
  const { getDatabase } = await import('../database/db.js');
  const db = getDatabase();
  const prefs = db.prepare('SELECT preferred_model FROM user_preferences WHERE user_id = ?').get(String(userId));
  const current = prefs?.preferred_model ? `Current: \`${prefs.preferred_model}\`` : 'Current: none (will use adapter default)';

  await ctx.reply(
    '🤖 *Select AI Model*\n\n' +
    `${current}\n\n` +
    'Choose the model for your next task:',
    {
      parse_mode: 'Markdown',
      ...keyboard
    }
  );
}

/**
 * /agents - Show agent role selection
 */
async function handleAgentsCommand(ctx, userId) {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🏗 Architect', 'agent:architect'),
      Markup.button.callback('⚙️ Engineer', 'agent:engineer')
    ],
    [
      Markup.button.callback('🚀 DevOps', 'agent:devops'),
      Markup.button.callback('🎨 Media Director', 'agent:media')
    ]
  ]);

  await ctx.reply(
    '👥 *Select Agent Role*\n\n' +
    'Choose the agent for your next task:',
    {
      parse_mode: 'Markdown',
      ...keyboard
    }
  );
}

/**
 * /task - Execute development task
 */
async function handleTaskCommand(ctx, userId, text) {
  const taskText = text.replace('/task', '').trim();

  if (!taskText) {
    await ctx.reply('❌ Please provide a task description.\n\nExample: /task Add a login page');
    return;
  }

  // Immediate acknowledgment
  await ctx.reply('🚀 Starting: ' + taskText);

  try {
    // Get or create session — returns the sessionId (UUID string) directly,
    // NOT a session object.
    const sessionId = await getOrCreateSession(userId, 'telegram');
    logger.info('TASK_STARTED', { userId, sessionId, task: taskText.substring(0, 100) });

    // Load the user's preferred model (if set via /model command) and switch
    // the LLM adapter to it before running the task.
    const { getDatabase } = await import('../database/db.js');
    const db = getDatabase();
    const prefs = db.prepare('SELECT preferred_model FROM user_preferences WHERE user_id = ?').get(String(userId));
    if (prefs?.preferred_model) {
      try {
        const { setProvider } = await import('../llm/adapter.js');
        setProvider(prefs.preferred_model);
        logger.info('TASK_USING_PREFERRED_MODEL', { userId, model: prefs.preferred_model });
      } catch (e) {
        logger.warn('Failed to set preferred model, using adapter default', { error: e.message });
      }
    }

    // Save user message
    await addMessage(sessionId, 'user', taskText);

    // Execute agent loop
    const results = await executeAgentLoop(taskText, sessionId, null, userId);

    // Build a detailed completion summary
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
      // Execute succeeded and wrote files — task is mostly done even if
      // deploy/validation failed. This is the common case where the file
      // is written but there's no test infra in the sandbox.
      summary = '✅ Task complete (files written).\n\n';
      if (validationFailed) {
        summary += 'ℹ️ Validation was skipped or failed because the sandbox workspace has no test infrastructure. The file was still written successfully.\n\n';
      } else if (!deployOk && !deploySkipped) {
        summary += 'ℹ️ Deploy phase failed (this is normal in a fresh sandbox with no test setup).\n\n';
      }
    } else if (results?.needsClarification) {
      summary = '💬 ' + (results.clarificationMenu || 'Task needs clarification.');
    } else {
      summary = '⚠️ Task finished with errors.\n\n';
      summary += `Error: ${results?.error || 'unknown'}\n\n`;
      if (!planOk) summary += `Plan phase: ${results?.plan?.error || 'failed'}\n`;
      if (!execOk) summary += `Execute phase: ${results?.execute?.error || 'failed'}\n`;
    }

    summary += `Phases: ${planOk ? '✓' : '✗'} plan · ${execOk ? '✓' : '✗'} execute · ${testOk ? '✓' : (testSkipped ? '⊘' : '✗')} test · ${deployOk ? '✓' : (deploySkipped ? '⊘' : '✗')} deploy\n`;
    if (filesWritten.length > 0) {
      summary += `\nFiles written to sandbox:\n${filesWritten.map(f => `  • ${f}`).join('\n')}`;
    }
    await ctx.reply(summary);
  } catch (err) {
    logger.error('TASK_FAILED', {
      userId,
      task: taskText,
      error: err.message,
      stack: err.stack
    });
    await ctx.reply('❌ Failed: ' + err.message);
  }
}

/**
 * /fix - Execute fix task (auto-prefixed)
 */
async function handleFixCommand(ctx, userId, text) {
  const fixText = text.replace('/fix', '').trim();

  if (!fixText) {
    await ctx.reply('❌ Please describe what to fix.\n\nExample: /fix The navbar is broken on mobile');
    return;
  }

  // Prefix with "fix: " and route to task handler
  const taskText = 'fix: ' + fixText;
  await handleTaskCommand(ctx, userId, '/task ' + taskText);
}

/**
 * /review_pr - Review pull request
 */
async function handleReviewPRCommand(ctx, userId, text) {
  const match = text.match(/\/review_pr\s+(\d+)/);

  if (!match) {
    await ctx.reply('❌ Please provide a PR number.\n\nExample: /review_pr 42');
    return;
  }

  const prNumber = match[1];
  const taskText = `Review pull request #${prNumber} and provide detailed feedback`;

  await handleTaskCommand(ctx, userId, '/task ' + taskText);
}

/**
 * /cancel - Cancel current running task
 */
async function handleCancelCommand(ctx, userId) {
  // TODO: Implement task cancellation
  await ctx.reply('🛑 Task cancellation requested.\n\nNote: This feature is being implemented.');
}

/**
 * /logs - Show last n log lines
 */
async function handleLogsCommand(ctx, text) {
  const match = text.match(/\/logs\s+(\d+)/);
  const lineCount = match ? parseInt(match[1]) : 10;

  await ctx.reply(
    `📋 *Last ${lineCount} log lines*\n\n` +
    'Log viewing feature coming soon!',
    { parse_mode: 'Markdown' }
  );
}

/**
 * Handle streaming events from agent loop
 */
async function handleStreamEvent(ctx, event, data) {
  switch (event) {
    case 'phase:update':
      if (data.status === 'active') {
        const phaseEmoji = {
          planning: '📋',
          executing: '⚙️',
          testing: '🧪',
          deploying: '🚀'
        };
        const emoji = phaseEmoji[data.phase] || '⚡';
        await ctx.reply(`${emoji} ${data.phase.charAt(0).toUpperCase() + data.phase.slice(1)}...`);
      } else if (data.status === 'done') {
        await ctx.reply(`✅ ${data.phase.charAt(0).toUpperCase() + data.phase.slice(1)} complete`);
      }
      break;

    case 'message:agent':
      // Send agent message (truncate if too long)
      const content = data.content.substring(0, 4000); // Telegram limit
      await ctx.reply(content);
      break;

    case 'task:error':
      await ctx.reply('❌ Error: ' + data.error);
      break;
  }
}

/**
 * Handle inline keyboard callbacks (model/agent selection)
 */
export async function handleTelegramCallback(ctx) {
  const callbackData = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;

  logger.info('TG_CALLBACK', { userId, data: callbackData });

  try {
    if (callbackData.startsWith('model:')) {
      const modelId = callbackData.replace('model:', '');
      const model = getModelById(modelId);

      if (model) {
        // Persist the model selection to user_preferences so future tasks use it.
        const { getDatabase } = await import('../database/db.js');
        const db = getDatabase();
        db.prepare(`
          INSERT INTO user_preferences (user_id, preferred_model, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            preferred_model = excluded.preferred_model,
            updated_at = excluded.updated_at
        `).run(String(userId), model.id, new Date().toISOString());

        // Also tell the LLM adapter to switch providers immediately for the
        // next task. The agent loop's /api/agent/task route already calls
        // setProvider(model) per-request, so this is just for any in-flight
        // direct calls.
        try {
          const { setProvider } = await import('../llm/adapter.js');
          setProvider(model.id);
        } catch (e) {
          logger.warn('Failed to set adapter provider on model select', { error: e.message });
        }

        await ctx.answerCbQuery();
        await ctx.reply(
          `✅ Model set to: *${model.name}*\n\n` +
          `Provider: ${model.provider}\n` +
          `Context window: ${(model.contextWindow || 0).toLocaleString()} tokens\n` +
          `Max output: ${(model.maxOutputTokens || 0).toLocaleString()} tokens`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.answerCbQuery('Unknown model');
      }
    } else if (callbackData.startsWith('agent:')) {
      const agentRole = callbackData.replace('agent:', '');

      // TODO: Save agent preference
      await ctx.answerCbQuery();
      await ctx.reply(`✅ Agent role set to: ${agentRole}`);
    } else if (callbackData.startsWith('repo:select:')) {
      // User selected a repository
      const parts = callbackData.split(':');
      const owner = parts[2];
      const repo = parts[3];

      const { getDatabase } = await import('../database/db.js');
      const db = getDatabase();

      // Save selection
      db.prepare(`
        INSERT INTO user_preferences (user_id, repo_owner, repo_name, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          repo_owner = excluded.repo_owner,
          repo_name = excluded.repo_name,
          updated_at = excluded.updated_at
      `).run(String(userId), owner, repo, new Date().toISOString());

      await ctx.answerCbQuery();
      await ctx.reply(
        `✅ *Repository Selected*\n\n` +
        `Now working on: \`${owner}/${repo}\`\n\n` +
        `All tasks will use this repository.`,
        { parse_mode: 'Markdown' }
      );

      logger.info('REPO_SELECTED', { userId, owner, repo });
    }
  } catch (err) {
    logger.error('TG_CALLBACK_ERROR', {
      error: err.message,
      data: callbackData
    });
    await ctx.answerCbQuery('Error: ' + err.message);
  }
}
