import { createSession, getActiveSession, closeSession, getOrCreateSession, validateSession, closeStaleSessionsForUser } from '../database/queries.js';
import { executeAgentLoop, formatLoopResults } from '../agent/loop.js';
import { reviewPullRequest, formatReviewResult } from '../github/pr-review.js';
import { getWorkflowStatus } from '../agent/phases/monitor.js';
import { ensureSandbox } from '../utils/filesystem.js';
import { validateUserInput, validatePRNumber, sanitizeForTelegram } from '../security/validation.js';
import logger from '../utils/logger.js';
import { formatMessage, formatSOPSummary, formatProgress } from './message-formatter.js';
import { isSOPEnabled } from '../agent/sop-integration.js';

/**
 * Handle /start command
 */
export async function handleStart(ctx) {
  const welcomeMessage = `
🤖 <b>MAX - Multi-Agent eXecutor System</b>
<i>Autonomous CI/CD Developer Agent</i>

Welcome! I'm your autonomous development assistant. I can:

• Execute development tasks with 5-phase self-healing
• Review pull requests for security & quality
• Monitor GitHub Actions workflows
• Automatically fix errors and retry

<b>Commands:</b>
/start - Show this message
/task &lt;description&gt; - Execute a development task
/review_pr &lt;number&gt; - Review a pull request
/status - Check workflow status
/help - Detailed help

<b>Example:</b>
/task Create a REST API endpoint for user authentication

Let's build something amazing! 🚀
`;

  await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
}

/**
 * Handle /help command
 */
export async function handleHelp(ctx) {
  const helpMessage = `
📚 <b>MAX - Complete Command Reference</b>
<i>Multi-Agent eXecutor System</i>

<b>🔧 Main Commands:</b>
/task &lt;desc&gt; - Execute development task
/review_pr &lt;num&gt; - Review pull request
/status - Check workflow status

<b>📁 Repository:</b>
/setrepo owner/repo - Set active repo
/repos - List repositories

<b>⚡ Quick Actions:</b>
/commit &lt;msg&gt; - Commit changes
/test - Run tests
/build - Build project

<b>🚀 Deployment:</b>
/pr &lt;title&gt; - Create pull request
/deploy - Deploy to production
/rollback - Rollback last deploy

<b>🔍 Debugging:</b>
/logs [lines] - View recent logs
/fix &lt;issue&gt; - Auto-fix problems
/docs - Generate documentation

<b>Examples:</b>
• /task Add user login
• /setrepo my-org/my-repo
• /commit Fix auth bug
• /pr Add payment feature
• /fix Tests failing
• /logs 100

Type /help for this menu anytime!
`;

  await ctx.reply(helpMessage, { parse_mode: 'HTML' });
}

/**
 * Handle /task command
 */
export async function handleTask(ctx) {
  const taskDescription = ctx.message.text.replace('/task', '').trim();

  // Validate input
  const validation = validateUserInput(taskDescription);
  if (!validation.valid) {
    await ctx.reply(`❌ Invalid input: ${validation.reason}`);
    return;
  }

  const userId = ctx.from.id;

  try {
    await ensureSandbox();

    // Close stale sessions first
    closeStaleSessionsForUser(String(userId));

    // Create session atomically - FIXED: Pass userId as string and platform separately
    const sessionId = getOrCreateSession(String(userId), 'telegram');

    // Validate session before execution
    const session = validateSession(sessionId);

    logger.info('Starting agent execution for Telegram task', {
      sessionId,
      userId,
      task: taskDescription.substring(0, 100)
    });

    // Send initial status
    const statusMessage = await ctx.reply('🚀 Starting autonomous agent execution...');

    let lastPhase = '';

    // Progress callback with enhanced error handling
    const progressCallback = async (progress) => {
      const { phase, status, attempt } = progress;

      let emoji = '⏳';
      if (status === 'success') emoji = '✓';
      if (status === 'failed') emoji = '✗';

      let text = `${emoji} <b>Phase: ${phase.toUpperCase()}</b> - ${status}`;

      if (attempt) {
        text += `\n🔄 Self-healing attempt ${attempt}/${process.env.MAX_RETRY_COUNT || 10}`;
      }

      // Only update if phase changed or final status
      if (phase !== lastPhase || status === 'success' || status === 'failed') {
        try {
          await ctx.telegram.editMessageText(
            statusMessage.chat.id,
            statusMessage.message_id,
            null,
            text,
            { parse_mode: 'HTML' }
          );
          lastPhase = phase;
        } catch (error) {
          // Log specific error reason instead of silently ignoring
          if (error.response?.error_code === 400) {
            logger.warn('Telegram message edit failed - message unchanged or too old', {
              sessionId,
              phase,
              errorCode: error.response.error_code,
              description: error.response.description
            });
          } else if (error.response?.error_code === 429) {
            logger.warn('Telegram rate limit hit', {
              sessionId,
              phase,
              retryAfter: error.response.parameters?.retry_after
            });
          } else {
            logger.error('Progress update failed', {
              sessionId,
              phase,
              error: error.message,
              errorCode: error.response?.error_code
            });
          }
        }
      }
    };

    // Execute agent loop with validated session
    const results = await executeAgentLoop(taskDescription, sessionId, progressCallback);

    // Format and send results
    let formattedResults;
    if (results.usedSOP && results.worksheetPath) {
      // Format SOP results
      formattedResults = formatSOPSummary(results.worksheetPath, results);
    } else {
      // Format standard loop results
      formattedResults = formatLoopResults(results);
    }
    await ctx.reply(formatMessage(formattedResults), { parse_mode: 'HTML' });

    // Send detailed error if failed
    if (!results.success) {
      let errorDetails = '❌ Error Details:\n\n';

      if (results.test && !results.test.success && !results.test.skipped) {
        const errorMsg = results.test.stderr?.substring(0, 500) || 'Unknown error';
        errorDetails += `Test failed:\n${errorMsg}`;
      } else if (results.error) {
        errorDetails += results.error.substring(0, 500);
      } else {
        errorDetails += 'No error details available';
      }

      await ctx.reply(errorDetails);
    }

    // Send workflow link if available
    if (results.monitor && results.monitor.workflow) {
      await ctx.reply(
        `🔗 <a href="${results.monitor.workflow.htmlUrl}">View workflow run</a>`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    logger.error('Task execution failed', { error: error.message, userId });
    await ctx.reply(`❌ Execution failed: ${sanitizeForTelegram(error.message)}`);
  }
}

/**
 * Handle /review_pr command
 */
export async function handleReviewPR(ctx) {
  const args = ctx.message.text.replace('/review_pr', '').trim();

  if (!args) {
    await ctx.reply('Usage: /review_pr <PR number>\n\nExample: /review_pr 42');
    return;
  }

  const prNumber = parseInt(args, 10);

  if (!validatePRNumber(prNumber)) {
    await ctx.reply('❌ Invalid PR number. Please provide a valid number.');
    return;
  }

  try {
    await ctx.reply(`🔍 Reviewing PR #${prNumber}...`);

    // Execute PR review
    const reviewResult = await reviewPullRequest(prNumber);

    // Format and send review
    const formattedReview = formatReviewResult(reviewResult);
    await ctx.reply(formattedReview, { parse_mode: 'HTML' });

    // Send risk alert if critical
    if (reviewResult.review.risk_level === 'critical') {
      await ctx.reply(
        '🚨 <b>CRITICAL RISK DETECTED</b>\n\nThis PR contains critical security issues. Do NOT merge until issues are resolved.',
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    logger.error('PR review failed', { prNumber, error: error.message });
    await ctx.reply(`❌ Failed to review PR: ${sanitizeForTelegram(error.message)}`);
  }
}

/**
 * Handle /status command
 */
export async function handleStatus(ctx) {
  try {
    await ctx.reply('Checking workflow status...');

    const status = await getWorkflowStatus();

    if (!status) {
      await ctx.reply('ℹ️ No workflow runs found.');
      return;
    }

    let statusEmoji = '⏳';
    if (status.conclusion === 'success') statusEmoji = '✓';
    if (status.conclusion === 'failure') statusEmoji = '✗';

    const statusText = `
${statusEmoji} <b>Latest Workflow</b>

Status: ${status.status}
Conclusion: ${status.conclusion || 'In progress'}
Created: ${new Date(status.createdAt).toLocaleString()}

<a href="${status.htmlUrl}">View Run</a>
`;

    await ctx.reply(statusText, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Status check failed', { error: error.message });
    await ctx.reply(`❌ Failed to check status: ${sanitizeForTelegram(error.message)}`);
  }
}

/**
 * Handle /setrepo command
 * Set the active GitHub repository for this user
 */
export async function handleSetRepo(ctx) {
  const args = ctx.message.text.replace('/setrepo', '').trim();

  if (!args || !args.includes('/')) {
    await ctx.reply(
      '📁 <b>Set Repository</b>\n\n' +
      'Usage: /setrepo owner/repo\n\n' +
      'Example: /setrepo johnadekola676-page/IDK',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const [owner, repo] = args.split('/');

  if (!owner || !repo) {
    await ctx.reply('❌ Invalid format. Use: /setrepo owner/repo');
    return;
  }

  try {
    const userId = ctx.from.id;

    // Store in session context
    const session = getActiveSession(userId) || createSession(userId);

    // Save repo selection
    db.prepare(`
      INSERT OR REPLACE INTO session_context (session_id, context_data)
      VALUES (?, ?)
    `).run(session.id, JSON.stringify({ repository: { owner, repo } }));

    logger.info('Repository set for user', { userId, owner, repo });

    await ctx.reply(
      `✅ Repository set to: <b>${owner}/${repo}</b>\n\n` +
      'All future tasks will use this repository.',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Failed to set repository', { error: error.message });
    await ctx.reply('❌ Failed to set repository. Please try again.');
  }
}

/**
 * Handle /repos command
 * List available repositories
 */
export async function handleRepos(ctx) {
  try {
    await ctx.reply(
      '📁 <b>Repository Management</b>\n\n' +
      'To set your active repository:\n' +
      '/setrepo owner/repo\n\n' +
      'Example:\n' +
      '/setrepo johnadekola676-page/IDK\n\n' +
      'Currently configured:\n' +
      `• GITHUB_OWNER: ${process.env.GITHUB_OWNER || 'not set'}\n` +
      `• GITHUB_REPO: ${process.env.GITHUB_REPO || 'not set'}`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Failed to list repos', { error: error.message });
    await ctx.reply('❌ Failed to list repositories.');
  }
}

/**
 * Handle /commit command
 * Quick commit with message
 */
export async function handleCommit(ctx) {
  const message = ctx.message.text.replace('/commit', '').trim();

  if (!message) {
    await ctx.reply(
      '💾 <b>Quick Commit</b>\n\n' +
      'Usage: /commit Your commit message\n\n' +
      'Example: /commit Add new feature',
      { parse_mode: 'HTML' }
    );
    return;
  }

  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('⏳ Creating commit...');

    // Trigger a commit task
    await executeAgentLoop(
      userId,
      `Commit all changes with message: "${message}"`,
      { sessionId: session.id }
    );

    await ctx.reply('✅ Commit created and pushed!', { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Commit failed', { error: error.message });
    await ctx.reply(`❌ Commit failed: ${error.message}`);
  }
}

/**
 * Handle /test command
 * Run tests
 */
export async function handleTest(ctx) {
  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('🧪 Running tests...');

    await executeAgentLoop(
      userId,
      'Run all tests and report results',
      { sessionId: session.id }
    );

    await ctx.reply('✅ Tests completed!');
  } catch (error) {
    logger.error('Test failed', { error: error.message });
    await ctx.reply(`❌ Tests failed: ${error.message}`);
  }
}

/**
 * Handle /build command
 * Build the project
 */
export async function handleBuild(ctx) {
  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('🔨 Building project...');

    await executeAgentLoop(
      userId,
      'Build the project and report any errors',
      { sessionId: session.id }
    );

    await ctx.reply('✅ Build completed!');
  } catch (error) {
    logger.error('Build failed', { error: error.message });
    await ctx.reply(`❌ Build failed: ${error.message}`);
  }
}

/**
 * Handle /pr command
 * Create a pull request
 */
export async function handlePR(ctx) {
  const title = ctx.message.text.replace('/pr', '').trim();

  if (!title) {
    await ctx.reply(
      '🔀 <b>Create Pull Request</b>\n\n' +
      'Usage: /pr Your PR title\n\n' +
      'Example: /pr Add user authentication feature',
      { parse_mode: 'HTML' }
    );
    return;
  }

  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('⏳ Creating pull request...');

    // Trigger PR creation task
    await executeAgentLoop(
      userId,
      `Create a pull request with title: "${title}". Include a detailed description of changes.`,
      { sessionId: session.id }
    );

    await ctx.reply('✅ Pull request created!');
  } catch (error) {
    logger.error('PR creation failed', { error: error.message });
    await ctx.reply(`❌ Failed to create PR: ${error.message}`);
  }
}

/**
 * Handle /deploy command
 * Trigger deployment
 */
export async function handleDeploy(ctx) {
  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('🚀 Triggering deployment...');

    await executeAgentLoop(
      userId,
      'Deploy the application. Push to main branch and verify deployment succeeds.',
      { sessionId: session.id }
    );

    await ctx.reply('✅ Deployment triggered! Check /status for progress.');
  } catch (error) {
    logger.error('Deployment failed', { error: error.message });
    await ctx.reply(`❌ Deployment failed: ${error.message}`);
  }
}

/**
 * Handle /rollback command
 * Rollback last deployment
 */
export async function handleRollback(ctx) {
  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('⏪ Rolling back...');

    await executeAgentLoop(
      userId,
      'Rollback to the previous stable version. Revert the last commit and redeploy.',
      { sessionId: session.id }
    );

    await ctx.reply('✅ Rollback completed!');
  } catch (error) {
    logger.error('Rollback failed', { error: error.message });
    await ctx.reply(`❌ Rollback failed: ${error.message}`);
  }
}

/**
 * Handle /logs command
 * View recent logs
 */
export async function handleLogs(ctx) {
  const lines = ctx.message.text.replace('/logs', '').trim() || '50';
  const numLines = parseInt(lines, 10);

  if (isNaN(numLines) || numLines < 1 || numLines > 1000) {
    await ctx.reply('❌ Invalid number. Use: /logs [1-1000]');
    return;
  }

  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply(`📋 Fetching last ${numLines} log lines...`);

    await executeAgentLoop(
      userId,
      `Show the last ${numLines} lines of application logs. Format them clearly.`,
      { sessionId: session.id }
    );

    await ctx.reply('✅ Logs retrieved!');
  } catch (error) {
    logger.error('Log fetch failed', { error: error.message });
    await ctx.reply(`❌ Failed to fetch logs: ${error.message}`);
  }
}

/**
 * Handle /fix command
 * Auto-fix common issues
 */
export async function handleFix(ctx) {
  const issue = ctx.message.text.replace('/fix', '').trim();

  if (!issue) {
    await ctx.reply(
      '🔧 <b>Auto-Fix</b>\n\n' +
      'Usage: /fix Description of the issue\n\n' +
      'Example: /fix Tests are failing\n\n' +
      'The agent will analyze and fix the issue automatically.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('🔍 Analyzing issue...');

    await executeAgentLoop(
      userId,
      `Fix this issue: ${issue}. Analyze, debug, and implement a solution. Run tests to verify the fix.`,
      { sessionId: session.id }
    );

    await ctx.reply('✅ Issue fixed!');
  } catch (error) {
    logger.error('Fix failed', { error: error.message });
    await ctx.reply(`❌ Fix failed: ${error.message}`);
  }
}

/**
 * Handle /docs command
 * Generate documentation
 */
export async function handleDocs(ctx) {
  try {
    const userId = ctx.from.id;
    const session = getActiveSession(userId) || createSession(userId);

    await ctx.reply('📚 Generating documentation...');

    await executeAgentLoop(
      userId,
      'Generate comprehensive documentation for the codebase. Create/update README, API docs, and code comments.',
      { sessionId: session.id }
    );

    await ctx.reply('✅ Documentation generated!');
  } catch (error) {
    logger.error('Docs generation failed', { error: error.message });
    await ctx.reply(`❌ Documentation failed: ${error.message}`);
  }
}

/**
 * Handle unknown commands and natural language messages
 * Supports both failed commands and natural language task requests
 */
export async function handleUnknown(ctx) {
  // Ignore non-text messages (stickers, images, etc.)
  if (!ctx.message?.text) {
    return;
  }

  const text = ctx.message.text.trim();

  // If it starts with /, it's a failed command
  if (text.startsWith('/')) {
    await ctx.reply(
      '❓ Unknown command. Use /help to see available commands.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Detect greetings and casual messages - don't trigger agent loop
  const casualPatterns = [
    /^(hi|hello|hey|greetings|sup|yo)\b/i,
    /^(thanks|thank you|thx|ty)\b/i,
    /^(ok|okay|cool|nice|great|awesome)\b/i,
    /^(bye|goodbye|see you|later)\b/i,
    /^(yes|no|yep|nope|yeah|nah)\b/i,
    /^(how are you|what'?s up|wassup)\b/i
  ];

  const isCasualMessage = casualPatterns.some(pattern => pattern.test(text));

  if (isCasualMessage) {
    await ctx.reply(
      '👋 Hello! I\'m MAX, your autonomous development assistant.\n\n' +
      'To execute a task, use: /task <description>\n' +
      'For help, type: /help',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // For any other normal message (not a casual greeting), provide helpful guidance
  await ctx.reply(
    '💡 Hey! To run a task use /task followed by your description.\n' +
    'Type /help for all available commands.',
    { parse_mode: 'HTML' }
  );
}

export default {
  handleStart,
  handleHelp,
  handleTask,
  handleReviewPR,
  handleStatus,
  handleSetRepo,
  handleRepos,
  handleCommit,
  handleTest,
  handleBuild,
  handlePR,
  handleDeploy,
  handleRollback,
  handleLogs,
  handleFix,
  handleDocs,
  handleUnknown
};
