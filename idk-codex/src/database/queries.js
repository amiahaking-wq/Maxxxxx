import { getDatabase } from './db.js';
import logger from '../utils/logger.js';

/**
 * Create a new session for a user
 * @param {number} userId - Telegram user ID
 * @returns {number} Session ID
 */
export function createSession(userId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO sessions (user_id, status)
      VALUES (?, 'active')
    `);
    const result = stmt.run(userId);
    logger.info(`Created session ${result.lastInsertRowid} for user ${userId}`);
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to create session', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get active session for a user
 * @param {number} userId - Telegram user ID
 * @returns {Object|null} Session object or null
 */
export function getActiveSession(userId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM sessions
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(userId);
  } catch (error) {
    logger.error('Failed to get active session', { userId, error: error.message });
    throw error;
  }
}

/**
 * Update session last activity timestamp
 * @param {number} sessionId - Session ID
 */
export function updateSessionActivity(sessionId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE sessions
      SET last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(sessionId);
  } catch (error) {
    logger.error('Failed to update session activity', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Close a session
 * @param {number} sessionId - Session ID
 */
export function closeSession(sessionId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE sessions
      SET status = 'inactive'
      WHERE id = ?
    `);
    stmt.run(sessionId);
    logger.info(`Closed session ${sessionId}`);
  } catch (error) {
    logger.error('Failed to close session', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Add a message to the session
 * @param {number} sessionId - Session ID
 * @param {string} role - Message role (user, assistant, system)
 * @param {string} content - Message content
 * @returns {number} Message ID
 */
export function addMessage(sessionId, role, content) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO messages (session_id, role, content)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(sessionId, role, content);
    updateSessionActivity(sessionId);
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to add message', { sessionId, role, error: error.message });
    throw error;
  }
}

/**
 * Get recent messages for a session
 * @param {number} sessionId - Session ID
 * @param {number} limit - Number of messages to retrieve
 * @returns {Array} Array of message objects
 */
export function getRecentMessages(sessionId, limit = 10) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT role, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const messages = stmt.all(sessionId, limit);
    return messages.reverse(); // Return in chronological order
  } catch (error) {
    logger.error('Failed to get recent messages', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Create an agent run record
 * @param {number} sessionId - Session ID
 * @param {string} phase - Agent phase (plan, execute, test, deploy, monitor)
 * @param {Object} metadata - Additional metadata (optional)
 * @returns {number} Agent run ID
 */
export function createAgentRun(sessionId, phase, metadata = null) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO agent_runs (session_id, phase, status, metadata)
      VALUES (?, ?, 'running', ?)
    `);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const result = stmt.run(sessionId, phase, metadataJson);
    logger.info(`Created agent run ${result.lastInsertRowid} for phase ${phase}`);
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to create agent run', { sessionId, phase, error: error.message });
    throw error;
  }
}

/**
 * Update agent run status
 * @param {number} runId - Agent run ID
 * @param {string} status - New status (success, failed, retrying)
 * @param {string|null} errorMessage - Error message if failed
 * @param {number|null} retryCount - Retry count if retrying
 */
export function updateAgentRun(runId, status, errorMessage = null, retryCount = null) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE agent_runs
      SET status = ?,
          error_message = ?,
          retry_count = COALESCE(?, retry_count),
          completed_at = CASE WHEN ? IN ('success', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = ?
    `);
    stmt.run(status, errorMessage, retryCount, status, runId);
    logger.info(`Updated agent run ${runId} to status ${status}`);
  } catch (error) {
    logger.error('Failed to update agent run', { runId, status, error: error.message });
    throw error;
  }
}

/**
 * Get agent runs for a session
 * @param {number} sessionId - Session ID
 * @param {string|null} phase - Filter by phase (optional)
 * @returns {Array} Array of agent run objects
 */
export function getAgentRuns(sessionId, phase = null) {
  try {
    const db = getDatabase();
    let query = `
      SELECT * FROM agent_runs
      WHERE session_id = ?
    `;
    const params = [sessionId];

    if (phase) {
      query += ' AND phase = ?';
      params.push(phase);
    }

    query += ' ORDER BY started_at DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params);
  } catch (error) {
    logger.error('Failed to get agent runs', { sessionId, phase, error: error.message });
    throw error;
  }
}

/**
 * Get the latest agent run for a session and phase
 * @param {number} sessionId - Session ID
 * @param {string} phase - Agent phase
 * @returns {Object|null} Agent run object or null
 */
export function getLatestAgentRun(sessionId, phase) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM agent_runs
      WHERE session_id = ? AND phase = ?
      ORDER BY started_at DESC
      LIMIT 1
    `);
    return stmt.get(sessionId, phase);
  } catch (error) {
    logger.error('Failed to get latest agent run', { sessionId, phase, error: error.message });
    throw error;
  }
}

// ============================================================================
// V2 Enhancement: Session Handoffs
// ============================================================================

/**
 * Create a handoff snapshot for session continuity
 * @param {number} sessionId - Session ID
 * @param {string} snapshotData - Markdown formatted snapshot
 * @param {Object} tokenUsage - Token usage {input, output}
 * @param {number} retryCount - Current retry count
 * @param {string|null} lastError - Last error message
 * @returns {number} Handoff ID
 */
export function createHandoffSnapshot(sessionId, snapshotData, tokenUsage, retryCount, lastError = null) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO session_handoffs (
        session_id, snapshot_data, token_usage_input, token_usage_output,
        retry_count, last_error
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      sessionId,
      snapshotData,
      tokenUsage.input || 0,
      tokenUsage.output || 0,
      retryCount,
      lastError
    );
    logger.info(`Created handoff snapshot ${result.lastInsertRowid} for session ${sessionId}`);
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to create handoff snapshot', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Get the latest handoff for a session
 * @param {number} sessionId - Session ID
 * @returns {Object|null} Handoff object or null
 */
export function getLatestHandoff(sessionId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM session_handoffs
      WHERE session_id = ? AND resumed = 0
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(sessionId);
  } catch (error) {
    logger.error('Failed to get latest handoff', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Atomically get and mark handoff as resumed (prevents race conditions)
 * @param {number} sessionId - Session ID
 * @returns {Object|null} Handoff object or null
 */
export function getAndResumeHandoff(sessionId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE session_handoffs
      SET resumed = 1
      WHERE id = (
        SELECT id FROM session_handoffs
        WHERE session_id = ? AND resumed = 0
        ORDER BY created_at DESC
        LIMIT 1
      )
      RETURNING *
    `);
    return stmt.get(sessionId);
  } catch (error) {
    logger.error('Failed to get and resume handoff', { sessionId, error: error.message });
    throw error;
  }
}

/**
 * Mark a handoff as resumed
 * @param {number} handoffId - Handoff ID
 */
export function markHandoffResumed(handoffId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE session_handoffs
      SET resumed = 1
      WHERE id = ?
    `);
    stmt.run(handoffId);
    logger.info(`Marked handoff ${handoffId} as resumed`);
  } catch (error) {
    logger.error('Failed to mark handoff as resumed', { handoffId, error: error.message });
    throw error;
  }
}

// ============================================================================
// V2 Enhancement: Error Pattern Learning
// ============================================================================

/**
 * Find a known fix for an error signature
 * @param {string} errorSignature - Normalized error signature
 * @returns {Object|null} Error pattern with fix or null
 */
export function findSimilarError(errorSignature) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM error_patterns
      WHERE error_signature = ?
      ORDER BY success_count DESC, last_success_at DESC
      LIMIT 1
    `);
    return stmt.get(errorSignature);
  } catch (error) {
    logger.error('Failed to find similar error', { errorSignature, error: error.message });
    throw error;
  }
}

/**
 * Save a successful fix for an error pattern
 * @param {string} errorSignature - Normalized error signature
 * @param {string} errorType - Error type (e.g., 'syntax', 'runtime', 'test')
 * @param {string} fixDescription - Description of the fix
 * @returns {number} Error pattern ID
 */
export function saveSuccessfulFix(errorSignature, errorType, fixDescription) {
  try {
    const db = getDatabase();

    // Try to update existing pattern first
    const existing = findSimilarError(errorSignature);

    if (existing) {
      return incrementFixSuccess(errorSignature, fixDescription);
    }

    // Create new pattern
    const stmt = db.prepare(`
      INSERT INTO error_patterns (error_signature, error_type, fix_description)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(errorSignature, errorType, fixDescription);
    logger.info(`Saved new error pattern ${result.lastInsertRowid}`, { errorType });
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to save successful fix', { errorSignature, error: error.message });
    throw error;
  }
}

/**
 * Increment success count for an error pattern
 * @param {string} errorSignature - Error signature
 * @param {string} fixDescription - Updated fix description
 * @returns {number} Updated pattern ID
 */
export function incrementFixSuccess(errorSignature, fixDescription) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE error_patterns
      SET success_count = success_count + 1,
          last_success_at = CURRENT_TIMESTAMP,
          fix_description = ?
      WHERE error_signature = ?
    `);
    stmt.run(fixDescription, errorSignature);

    const pattern = findSimilarError(errorSignature);
    logger.info(`Incremented success count for error pattern`, {
      id: pattern.id,
      successCount: pattern.success_count
    });
    return pattern.id;
  } catch (error) {
    logger.error('Failed to increment fix success', { errorSignature, error: error.message });
    throw error;
  }
}

// ============================================================================
// V2 Enhancement: Audit Logging
// ============================================================================

/**
 * Sanitize audit details to prevent PII/secrets leakage
 * @param {Object|null} details - Details to sanitize
 * @returns {Object|null} Sanitized details
 */
function sanitizeAuditDetails(details) {
  if (!details || typeof details !== 'object') return details;

  const sanitized = { ...details };
  const sensitivePatterns = [
    /api[_-]?key/i,
    /token/i,
    /password/i,
    /secret/i,
    /credential/i,
    /auth/i,
    /bearer/i
  ];

  for (const key of Object.keys(sanitized)) {
    if (sensitivePatterns.some(pattern => pattern.test(key))) {
      sanitized[key] = '[REDACTED]';
    }
    // Also check string values for patterns like sk-...
    if (typeof sanitized[key] === 'string' &&
        (sanitized[key].startsWith('sk-') ||
         sanitized[key].startsWith('Bearer ') ||
         sanitized[key].length > 50)) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

/**
 * Log an audit event for security tracking
 * @param {number} userId - User ID
 * @param {number|null} sessionId - Session ID (optional)
 * @param {string} eventType - Event type (e.g., 'file_write', 'command_exec', 'git_commit')
 * @param {string} action - Action description
 * @param {Object|null} details - Additional details
 * @param {string} riskLevel - Risk level: 'low', 'medium', 'high', 'critical'
 * @returns {number} Audit log ID
 */
export function logAuditEvent(userId, sessionId, eventType, action, details = null, riskLevel = 'low') {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, session_id, event_type, action, details, risk_level)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const detailsJson = details ? JSON.stringify(sanitizeAuditDetails(details)) : null;
    const result = stmt.run(userId, sessionId, eventType, action, detailsJson, riskLevel);
    return result.lastInsertRowid;
  } catch (error) {
    logger.error('Failed to log audit event', { userId, eventType, error: error.message });
    throw error;
  }
}

/**
 * Get audit history for a user or session
 * @param {Object} filters - Filter options {userId, sessionId, eventType, riskLevel, limit}
 * @returns {Array} Array of audit log objects
 */
export function getAuditHistory(filters = {}) {
  try {
    const db = getDatabase();
    const {
      userId = null,
      sessionId = null,
      eventType = null,
      riskLevel = null,
      limit = 100
    } = filters;

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    if (sessionId) {
      query += ' AND session_id = ?';
      params.push(sessionId);
    }

    if (eventType) {
      query += ' AND event_type = ?';
      params.push(eventType);
    }

    if (riskLevel) {
      query += ' AND risk_level = ?';
      params.push(riskLevel);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(query);
    return stmt.all(...params);
  } catch (error) {
    logger.error('Failed to get audit history', { filters, error: error.message });
    throw error;
  }
}

// ============================================================================
// V3 Enhancement: Atomic Session Management for Telegram
// ============================================================================

/**
 * Get or create session atomically with transaction
 * Closes any existing active sessions for the user and creates new one with UUID
 * @param {string} userId - User ID (converted to string)
 * @param {string} platform - Platform ('telegram', 'web', 'cli')
 * @returns {string} - Session ID (UUID)
 */
export function getOrCreateSession(userId, platform = 'telegram') {
  if (!userId) {
    throw new Error('userId is required for session creation');
  }

  // Ensure userId is a string
  const userIdStr = String(userId);

  try {
    const db = getDatabase();

    return db.transaction(() => {
      // Check for existing active session
      const existingStmt = db.prepare(`
        SELECT id FROM sessions
        WHERE user_id = ? AND platform = ? AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const existing = existingStmt.get(userIdStr, platform);

      if (existing) {
        logger.info('Reusing existing active session', {
          sessionId: existing.id,
          userId: userIdStr,
          platform
        });
        return existing.id;
      }

      // Close any existing active sessions for this user + platform
      const closeStmt = db.prepare(`
        UPDATE sessions
        SET status = 'inactive', last_activity = CURRENT_TIMESTAMP
        WHERE user_id = ? AND platform = ? AND status = 'active'
      `);
      const closeResult = closeStmt.run(userIdStr, platform);

      if (closeResult.changes > 0) {
        logger.info('Closed previous active sessions', {
          userId: userIdStr,
          platform,
          count: closeResult.changes
        });
      }

      // Generate new UUID session ID using crypto.randomUUID()
      const sessionId = crypto.randomUUID();

      // Create new session with UUID
      const createStmt = db.prepare(`
        INSERT INTO sessions (id, user_id, platform, status, created_at, last_activity)
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      createStmt.run(sessionId, userIdStr, platform);

      logger.info('Created new session with UUID', {
        sessionId,
        userId: userIdStr,
        platform,
        closedPrevious: closeResult.changes > 0
      });

      return sessionId;
    })();
  } catch (error) {
    logger.error('Failed to get or create session', {
      userId: userIdStr,
      platform,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Validate session state before execution
 * @param {number} sessionId - Session ID
 * @returns {Object} - Session with validation metadata
 * @throws {Error} - If session is invalid
 */
export function validateSession(sessionId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT s.*, COUNT(m.id) as message_count
    FROM sessions s
    LEFT JOIN messages m ON m.session_id = s.id
    WHERE s.id = ?
    GROUP BY s.id
  `);
  const session = stmt.get(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.status !== 'active') {
    throw new Error(`Session ${sessionId} is ${session.status}`);
  }

  const ageMs = Date.now() - new Date(session.created_at).getTime();
  const ageMinutes = Math.floor(ageMs / 60000);

  logger.info('Session validated', {
    sessionId,
    messageCount: session.message_count,
    ageMinutes
  });

  return session;
}

/**
 * Close stale sessions for a user
 * @param {string} userId - User ID
 * @param {number} maxAgeMinutes - Maximum age in minutes (default 30)
 * @returns {number} - Number of sessions closed
 */
export function closeStaleSessionsForUser(userId, maxAgeMinutes = 30) {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE sessions
    SET status = 'timeout', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
    AND status = 'active'
    AND datetime(created_at) < datetime('now', '-' || ? || ' minutes')
  `);
  const result = stmt.run(userId, maxAgeMinutes);

  if (result.changes > 0) {
    logger.info('Closed stale sessions', {
      userId,
      count: result.changes,
      maxAgeMinutes
    });
  }

  return result.changes;
}

export default {
  createSession,
  getActiveSession,
  updateSessionActivity,
  closeSession,
  addMessage,
  getRecentMessages,
  createAgentRun,
  updateAgentRun,
  getAgentRuns,
  getLatestAgentRun,
  // V2 enhancements
  createHandoffSnapshot,
  getLatestHandoff,
  getAndResumeHandoff,
  markHandoffResumed,
  findSimilarError,
  saveSuccessfulFix,
  incrementFixSuccess,
  logAuditEvent,
  getAuditHistory,
  // V3 enhancements
  getOrCreateSession,
  validateSession,
  closeStaleSessionsForUser
};
