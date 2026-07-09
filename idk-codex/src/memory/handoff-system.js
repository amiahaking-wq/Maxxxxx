/**
 * Phase 3: Handoff System
 * Serializes conversation logs, open bugs, and next steps when context approaches limit
 * Creates snapshot for continuation in new session
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import logger from '../utils/logger.js';
import { getDatabase } from '../database/db.js';
import { completion } from '../llm/adapter.js';

const HANDOFF_DIR = process.env.OBSIDIAN_VAULT_PATH
  ? join(process.env.OBSIDIAN_VAULT_PATH, 'handoffs')
  : './handoffs';

const CONTEXT_THRESHOLD = parseFloat(process.env.HANDOFF_CONTEXT_THRESHOLD || '0.8');

/**
 * Check if handoff is needed based on context usage
 */
export function shouldHandoff(currentTokens, maxTokens) {
  const usage = currentTokens / maxTokens;
  return usage >= CONTEXT_THRESHOLD;
}

/**
 * Create handoff snapshot
 */
export async function createHandoff(sessionId, context = {}) {
  try {
    logger.info('Creating handoff snapshot', { sessionId });

    // Ensure handoff directory exists
    await fs.mkdir(HANDOFF_DIR, { recursive: true });

    // Get session data
    const sessionData = await getSessionData(sessionId);

    // Generate handoff document
    const handoffDoc = await generateHandoffDocument(sessionId, sessionData, context);

    // Save to file
    const timestamp = new Date();
    const filename = `handoff-session-${sessionId}-${timestamp.getTime()}.md`;
    const filepath = join(HANDOFF_DIR, filename);

    await fs.writeFile(filepath, handoffDoc, 'utf-8');

    // Store in database
    await storeHandoffMetadata(sessionId, filepath, context);

    logger.info('Handoff snapshot created', { sessionId, filename });

    return {
      success: true,
      filepath,
      filename
    };
  } catch (error) {
    logger.error('Failed to create handoff', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Get session data from database
 */
async function getSessionData(sessionId) {
  const db = getDatabase();

  // Get session info
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  // Get all messages
  const messages = db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC')
    .all(sessionId);

  // Get agent runs
  const agentRuns = db
    .prepare('SELECT * FROM agent_runs WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId);

  return {
    session,
    messages,
    agentRuns
  };
}

/**
 * Generate handoff document with AI summarization
 */
async function generateHandoffDocument(sessionId, sessionData, context) {
  const { session, messages, agentRuns } = sessionData;

  // Build conversation history
  const conversation = messages
    .map(m => `**${m.role}**: ${m.content.substring(0, 500)}`)
    .join('\n\n');

  // Summarize with AI
  let summary = '';
  let openTasks = [];
  let nextSteps = [];

  try {
    const summaryResult = await completion({
      messages: [
        {
          role: 'system',
          content: `You are summarizing a development conversation for handoff to a new session.
Analyze the conversation and provide:
1. Brief summary (2-3 sentences)
2. Open tasks (list format)
3. Next steps (list format)
4. Important context to preserve

Respond in JSON format:
{
  "summary": "Brief summary...",
  "openTasks": ["Task 1", "Task 2"],
  "nextSteps": ["Step 1", "Step 2"],
  "context": ["Context 1", "Context 2"]
}`
        },
        {
          role: 'user',
          content: `Conversation:\n${conversation.substring(0, 4000)}`
        }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(summaryResult.content);
    summary = parsed.summary || '';
    openTasks = parsed.openTasks || [];
    nextSteps = parsed.nextSteps || [];
  } catch (error) {
    logger.warn('Failed to generate AI summary for handoff', { error: error.message });
    summary = 'AI summary unavailable';
  }

  // Build document
  const sections = [];

  // Frontmatter
  sections.push('---');
  sections.push(`sessionId: ${sessionId}`);
  sections.push(`type: handoff`);
  sections.push(`created: ${new Date().toISOString()}`);
  sections.push(`contextThreshold: ${CONTEXT_THRESHOLD}`);
  sections.push(`tags: [handoff, session-${sessionId}, continuation]`);
  sections.push('---');
  sections.push('');

  // Title
  sections.push(`# Handoff: Session ${sessionId}`);
  sections.push('');
  sections.push(`**Created**: ${new Date().toLocaleString()}`);
  sections.push(`**Context Usage**: ${(context.tokenUsage / context.maxTokens * 100).toFixed(1)}%`);
  sections.push(`**Reason**: Context approaching limit (${CONTEXT_THRESHOLD * 100}% threshold)`);
  sections.push('');

  // Summary
  sections.push('## Summary');
  sections.push('');
  sections.push(summary);
  sections.push('');

  // Open Tasks
  sections.push('## Open Tasks');
  sections.push('');
  if (openTasks.length > 0) {
    openTasks.forEach(task => {
      sections.push(`- [ ] ${task}`);
    });
  } else {
    sections.push('_No open tasks_');
  }
  sections.push('');

  // Next Steps
  sections.push('## Next Steps');
  sections.push('');
  if (nextSteps.length > 0) {
    nextSteps.forEach((step, idx) => {
      sections.push(`${idx + 1}. ${step}`);
    });
  } else {
    sections.push('_No specific next steps identified_');
  }
  sections.push('');

  // Agent Runs Summary
  sections.push('## Agent Run History');
  sections.push('');
  if (agentRuns.length > 0) {
    const lastRuns = agentRuns.slice(-5); // Last 5 runs
    sections.push('| Phase | Status | Time |');
    sections.push('|-------|--------|------|');
    lastRuns.forEach(run => {
      const phase = run.phase || 'unknown';
      const status = run.status === 'success' ? '✅' : run.status === 'failed' ? '❌' : '⏳';
      const time = new Date(run.created_at).toLocaleTimeString();
      sections.push(`| ${phase} | ${status} | ${time} |`);
    });
  } else {
    sections.push('_No agent runs recorded_');
  }
  sections.push('');

  // Conversation Log (abbreviated)
  sections.push('## Recent Conversation');
  sections.push('');
  const recentMessages = messages.slice(-10); // Last 10 messages
  recentMessages.forEach(msg => {
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    const content = msg.content.substring(0, 200);
    sections.push(`### ${role}`);
    sections.push('');
    sections.push(content);
    if (msg.content.length > 200) {
      sections.push('...');
    }
    sections.push('');
  });

  // Important Context
  sections.push('---');
  sections.push('');
  sections.push('## Important Context to Preserve');
  sections.push('');
  sections.push(`- **Repository**: ${context.repository || 'N/A'}`);
  sections.push(`- **Branch**: ${context.branch || 'N/A'}`);
  sections.push(`- **Last Commit**: ${context.lastCommit || 'N/A'}`);
  sections.push(`- **Open Files**: ${context.openFiles?.length || 0}`);
  sections.push('');

  // Continuation Instructions
  sections.push('## How to Continue');
  sections.push('');
  sections.push('1. Read this handoff document');
  sections.push('2. Review open tasks and next steps');
  sections.push('3. Check recent conversation for context');
  sections.push('4. Ask user if they want to continue from where we left off');
  sections.push('5. Use the stored context to maintain continuity');
  sections.push('');

  // Links
  sections.push('---');
  sections.push('');
  sections.push('## Related');
  sections.push('');
  sections.push(`- [[session-${sessionId}]]`);
  sections.push(`- Previous handoffs in this session`);

  return sections.join('\n');
}

/**
 * Store handoff metadata in database
 */
async function storeHandoffMetadata(sessionId, filepath, context) {
  const db = getDatabase();

  // Create handoffs table if not exists
  db.prepare(`
    CREATE TABLE IF NOT EXISTS handoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      filepath TEXT NOT NULL,
      created_at TEXT NOT NULL,
      context_usage REAL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `).run();

  // Insert handoff record
  db.prepare(`
    INSERT INTO handoffs (session_id, filepath, created_at, context_usage)
    VALUES (?, ?, ?, ?)
  `).run(
    sessionId,
    filepath,
    new Date().toISOString(),
    context.tokenUsage / context.maxTokens
  );

  logger.debug('Handoff metadata stored', { sessionId });
}

/**
 * Get all handoffs for a session
 */
export function getSessionHandoffs(sessionId) {
  const db = getDatabase();

  try {
    const handoffs = db
      .prepare('SELECT * FROM handoffs WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId);

    return handoffs;
  } catch (error) {
    logger.warn('Failed to get session handoffs', { error: error.message });
    return [];
  }
}

/**
 * Load handoff document
 */
export async function loadHandoff(handoffId) {
  const db = getDatabase();

  try {
    const handoff = db.prepare('SELECT * FROM handoffs WHERE id = ?').get(handoffId);

    if (!handoff) {
      throw new Error(`Handoff ${handoffId} not found`);
    }

    const content = await fs.readFile(handoff.filepath, 'utf-8');

    return {
      ...handoff,
      content
    };
  } catch (error) {
    logger.error('Failed to load handoff', { handoffId, error: error.message });
    throw error;
  }
}

/**
 * Command handler for /handoff
 */
export async function handleHandoffCommand(sessionId, args = {}) {
  try {
    // Get current context info
    const context = {
      tokenUsage: args.tokenUsage || 0,
      maxTokens: args.maxTokens || 128000,
      repository: args.repository,
      branch: args.branch,
      lastCommit: args.lastCommit,
      openFiles: args.openFiles || []
    };

    // Create handoff
    const result = await createHandoff(sessionId, context);

    // Return formatted message
    return {
      success: true,
      message: `✅ Handoff created successfully!\n\nFile: ${result.filename}\n\nThis snapshot includes:\n- Conversation summary\n- Open tasks\n- Next steps\n- Recent activity\n\nYou can continue this work in a new session by referencing this handoff.`,
      filepath: result.filepath,
      filename: result.filename
    };
  } catch (error) {
    return {
      success: false,
      message: `❌ Failed to create handoff: ${error.message}`
    };
  }
}

export default {
  shouldHandoff,
  createHandoff,
  getSessionHandoffs,
  loadHandoff,
  handleHandoffCommand
};
