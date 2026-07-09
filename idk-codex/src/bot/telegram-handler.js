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
    } else if (text.startsWith('/model')) {
      await handleModelCommand(ctx, userId);
    } else if (text.startsWith('/agents')) {
      await handleAgentsCommand(ctx, userId);
    } else if (text.startsWith('/task')) {
      await handleTaskCommand(ctx, userId, text);
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

*Task Management:*
/task [text] - Execute a development task
/fix [text] - Fix an issue (auto-prefixed)
/cancel - Cancel current running task
/status - Show current session status

*Configuration:*
/model - Select AI model
/agents - Choose agent role
/repos - List and switch repositories

*Utilities:*
/review\\_pr [number] - Review a pull request
/logs [n] - Show last n log lines
/help - Show this message

*Examples:*
\`/task Add a login page with validation\`
\`/fix The navbar isn't responsive on mobile\`
\`/review_pr 42\`
  `.trim();

  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}

/**
 * /status - Current session status
 */
async function handleStatusCommand(ctx, userId) {
  try {
    const session = await getOrCreateSession(userId, 'telegram');

    const statusMessage = `
📊 *Session Status*

Session ID: \`${session.id}\`
Platform: Telegram
Status: ${session.status || 'idle'}
Created: ${new Date(session.createdAt).toLocaleString()}
Messages: ${session.messageCount || 0}

Current Repository: ${session.repoName || 'Not set'}
Current Model: ${session.currentModel || 'groq-llama-70b'}
    `.trim();

    await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
  } catch (err) {
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
 * /model - Show model selection inline keyboard
 */
async function handleModelCommand(ctx, userId) {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('Llama 3.3 70B ⚡', 'model:groq-llama-70b'),
      Markup.button.callback('Llama 3.1 8B ⚡⚡', 'model:groq-llama-8b')
    ],
    [
      Markup.button.callback('Claude Sonnet 🧠', 'model:anthropic-sonnet'),
      Markup.button.callback('Qwen Local 📱', 'model:phone-qwen')
    ]
  ]);

  await ctx.reply(
    '🤖 *Select AI Model*\n\n' +
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
    // Get or create session
    const session = await getOrCreateSession(userId, 'telegram');
    const sessionId = session.id;

    // Save user message
    await addMessage(sessionId, 'user', taskText);

    // Execute agent loop
    const results = await executeAgentLoop(taskText, sessionId, null, userId);

    // Task complete
    await ctx.reply('✅ Task complete!\n\n' + (results?.success ? 'Task finished successfully.' : 'Task finished with errors.'));

  } catch (err) {
    logger.error('TASK_FAILED', {
      userId,
      task: taskText,
      error: err.message
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
        // Save to session
        const session = await getOrCreateSession(userId, 'telegram');
        // TODO: Save model preference to database

        await ctx.answerCbQuery();
        await ctx.reply(`✅ Model set to: ${model.name}`);
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
