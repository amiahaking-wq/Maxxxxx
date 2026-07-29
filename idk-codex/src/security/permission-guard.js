/**
 * Permission Guard — Stage 6B
 *
 * Checks every tool call before execution:
 *   1. BLOCKED patterns → permanently refused (rm -rf /, mkfs, dd, sudo rm)
 *   2. Destructive patterns → require explicit user confirmation via WebSocket
 *   3. Permission check → user must have granted the required permission
 *   4. Default-allowed permissions → proceed
 *
 * Every tool call is logged to max_audit_log for the audit trail.
 * Credential tool calls are logged WITHOUT the password field.
 */

import { getDatabase } from '../database/db.js';
import logger from '../utils/logger.js';

// ============================================================================
// PATTERN MATCHING
// ============================================================================

// Destructive patterns — require explicit user confirmation before executing
const DESTRUCTIVE_PATTERNS = [
  /rm\s+-rf/i,
  /rm\s+-r\b/i,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM(?!.*WHERE)/i, // DELETE without WHERE clause
  /TRUNCATE/i,
  /format\s+[a-z]:/i,
  /git\s+push.*--force/i,
  /git\s+reset.*--hard/i,
  /DROP\s+DATABASE/i,
  /SHUTDOWN/i,
  /KILL\s+-9/i,
  /pkill/i,
  /killall/i
];

// Always-blocked patterns — never executed, no option to override
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//i,           // rm -rf / (system root)
  /rm\s+-rf\s+\~/i,           // rm -rf ~ (home directory)
  /rm\s+-rf\s+\.\./i,         // rm -rf ..
  /sudo\s+rm/i,               // sudo rm anything
  /mkfs/i,                    // format filesystem
  /dd\s+if=/i,                // dd write
  /:\(\)\{.*\|.*&\s*\};:/i,   // fork bomb
  /curl\s+.*\|\s*sh/i,        // curl | sh (remote code execution)
  /wget\s+.*\|\s*sh/i,        // wget | sh
  /\bDROP\s+TABLE\s+max_/i,   // drop MAX system tables
  /\bDROP\s+TABLE\s+conversations/i,
  /\bDROP\s+TABLE\s+conversation_messages/i
];

// Map tool names to required permissions
const PERMISSION_MAP = {
  // Browser
  'browser_navigate': 'browser_read',
  'browser_get_text': 'browser_read',
  'browser_screenshot': 'browser_read',
  'browser_evaluate': 'browser_read',
  'browser_click': 'browser_write',
  'browser_type': 'browser_write',
  // Bash
  'bash': 'bash_read',  // elevated to bash_write if destructive
  // Files
  'read_file': 'file_read',
  'list_files': 'file_read',
  'search': 'file_read',
  'write_file': 'file_write',
  'edit_file': 'file_write',
  // Memory
  'memory_save': 'memory_write',
  'memory_get': 'memory_read',
  'memory_list': 'memory_read',
  'memory_delete': 'memory_write',
  // Web
  'web_fetch': 'browser_read',
  // Credentials
  'credential_get': 'credential_use',
  'credential_save': 'credential_use',
  // Knowledge
  'knowledge_add': 'memory_write',
  'knowledge_search': 'memory_read',
  'knowledge_list': 'memory_read',
  // Connectors — require external_api permission
  'github_create_issue': 'external_api',
  'github_list_issues': 'external_api',
  'github_create_pr': 'external_api',
  'github_search_code': 'external_api',
  'github_get_file': 'external_api',
  'supabase_query': 'external_api',
  'supabase_insert': 'external_api',
  'supabase_list_tables': 'external_api',
  'gmail_search': 'external_api',
  'gmail_send': 'external_api',
  'calendar_list_events': 'external_api',
  'calendar_create_event': 'external_api',
  'drive_search': 'external_api',
  'drive_create_doc': 'external_api'
};

// Permissions granted by default to new users
const DEFAULT_ALLOWED = [
  'browser_read',
  'bash_read',
  'file_read',
  'file_write',
  'memory_read',
  'memory_write'
];

// Permissions that require explicit grant
const REQUIRES_EXPLICIT_GRANT = [
  'browser_write',    // fill forms, click buttons
  'bash_write',       // commands that modify system
  'file_delete',      // delete files
  'git_push',         // push to GitHub
  'external_api',     // call external APIs (connectors)
  'credential_use'    // use stored credentials
];

// ============================================================================
// PERMISSION GUARD CLASS
// ============================================================================

export class PermissionGuard {
  /**
   * Check whether a tool call is allowed, blocked, or requires confirmation.
   *
   * @param {string} userId
   * @param {string} toolName
   * @param {Object} toolArgs
   * @returns {Object} { allowed, blocked, requiresConfirmation, reason, description, riskLevel }
   */
  async checkPermission(userId, toolName, toolArgs = {}) {
    // 1. Check always-blocked patterns first
    if (toolName === 'bash') {
      const cmd = toolArgs.command || '';
      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(cmd)) {
          return {
            allowed: false,
            blocked: true,
            requiresConfirmation: false,
            reason: 'This command is permanently blocked for safety.',
            description: `Blocked command: ${cmd.substring(0, 100)}`
          };
        }
      }
    }

    // 2. Check if action is destructive (requires confirmation)
    const isDestructive = this.isDestructive(toolName, toolArgs);

    // 3. Check if user has permission
    const requiredPermission = this.getRequiredPermission(toolName, toolArgs);
    const hasPermission = this.userHasPermission(userId, requiredPermission);

    if (!hasPermission) {
      return {
        allowed: false,
        blocked: false,
        requiresConfirmation: false,
        reason: `You haven't granted MAX permission to: ${requiredPermission}. ` +
                `Tell the user: "I need permission to ${requiredPermission}. Say 'allow MAX to ${requiredPermission}' to enable this."`,
        description: this.describeAction(toolName, toolArgs),
        riskLevel: 'permission'
      };
    }

    // 4. If destructive, require confirmation
    if (isDestructive) {
      return {
        allowed: false,
        blocked: false,
        requiresConfirmation: true,
        reason: 'This action cannot be undone. Please confirm.',
        description: this.describeAction(toolName, toolArgs),
        riskLevel: 'high'
      };
    }

    // 5. Connector calls are medium risk — confirm unless user has auto-approved
    if (this.isConnectorCall(toolName) && !this.userHasPermission(userId, 'auto_approve_connectors')) {
      return {
        allowed: false,
        blocked: false,
        requiresConfirmation: true,
        reason: 'This action uses an external service. Please confirm.',
        description: this.describeAction(toolName, toolArgs),
        riskLevel: 'medium'
      };
    }

    return { allowed: true, blocked: false, requiresConfirmation: false };
  }

  /**
   * Determine if a tool call is destructive.
   */
  isDestructive(toolName, toolArgs = {}) {
    if (toolName === 'bash') {
      const cmd = toolArgs.command || '';
      return DESTRUCTIVE_PATTERNS.some(p => p.test(cmd));
    }
    // Connector calls that modify external state
    if (['github_create_issue', 'github_create_pr', 'supabase_insert',
         'gmail_send', 'calendar_create_event', 'drive_create_doc'].includes(toolName)) {
      return true;
    }
    return false;
  }

  /**
   * Check if a tool call targets an external connector.
   */
  isConnectorCall(toolName) {
    return /^(github|supabase|gmail|calendar|drive)_/.test(toolName);
  }

  /**
   * Get the required permission for a tool call.
   * For bash, escalates to bash_write if destructive.
   */
  getRequiredPermission(toolName, toolArgs = {}) {
    if (toolName === 'bash') {
      // If the command is destructive, require bash_write permission
      const cmd = toolArgs.command || '';
      const isWrite = DESTRUCTIVE_PATTERNS.some(p => p.test(cmd)) ||
                      /\b(rm|mv|cp|mkdir|rmdir|chmod|chown|kill|pkill|killall|sudo|apt|pip|npm|yarn|git\s+push|git\s+commit)\b/i.test(cmd);
      return isWrite ? 'bash_write' : 'bash_read';
    }
    return PERMISSION_MAP[toolName] || 'file_read';
  }

  /**
   * Check if a user has a specific permission.
   */
  userHasPermission(userId, permission) {
    // Default-allowed permissions are always granted
    if (DEFAULT_ALLOWED.includes(permission)) {
      // But check if user has explicitly revoked it
      try {
        const db = getDatabase();
        const row = db.prepare(
          'SELECT is_allowed FROM max_permissions WHERE user_id = ? AND permission = ?'
        ).get(userId, permission);
        // If explicitly set to 0, revoked. Otherwise allowed.
        return row ? row.is_allowed === 1 : true;
      } catch (e) {
        logger.error('Permission check failed', { error: e.message });
        return false;  // DB error = DENY everything
      }
    }
    // Explicit-grant permissions require a row with is_allowed=1
    try {
      const db = getDatabase();
      const row = db.prepare(
        'SELECT is_allowed FROM max_permissions WHERE user_id = ? AND permission = ?'
      ).get(userId, permission);
      return row && row.is_allowed === 1;
    } catch (e) {
      return false;
    }
  }

  /**
   * Generate a human-readable description of the action.
   */
  describeAction(toolName, toolArgs = {}) {
    if (toolName === 'bash') {
      const cmd = (toolArgs.command || '').substring(0, 200);
      return `Run shell command: \`${cmd}\``;
    }
    if (toolName === 'write_file') {
      return `Create/overwrite file: ${toolArgs.path}`;
    }
    if (toolName === 'edit_file') {
      return `Edit file: ${toolArgs.path}`;
    }
    if (toolName === 'github_create_issue') {
      return `Create GitHub issue in ${toolArgs.owner}/${toolArgs.repo}: "${toolArgs.title}"`;
    }
    if (toolName === 'github_create_pr') {
      return `Create pull request in ${toolArgs.owner}/${toolArgs.repo}: "${toolArgs.title}"`;
    }
    if (toolName === 'supabase_insert') {
      return `Insert row into Supabase table: ${toolArgs.table}`;
    }
    if (toolName === 'gmail_send') {
      return `Send email to: ${toolArgs.to} — subject: "${toolArgs.subject}"`;
    }
    if (toolName === 'calendar_create_event') {
      return `Create calendar event: "${toolArgs.title}"`;
    }
    if (toolName === 'credential_save') {
      return `Save credentials for: ${toolArgs.service_name}`;
    }
    if (toolName === 'credential_get') {
      return `Retrieve credentials for: ${toolArgs.service_name}`;
    }
    const argsStr = JSON.stringify(toolArgs).substring(0, 150);
    return `${toolName}: ${argsStr}`;
  }

  /**
   * Log an action to the audit trail.
   * CRITICAL: never log passwords or API keys.
   */
  logAction(userId, sessionId, toolName, toolArgs, result, options = {}) {
    try {
      const db = getDatabase();
      // Sanitize args — remove sensitive fields
      const safeArgs = this.sanitizeArgs(toolName, toolArgs);
      db.prepare(`
        INSERT INTO max_audit_log
        (user_id, session_id, action_type, tool_name, tool_args,
         result_summary, was_destructive, required_confirmation, user_confirmed)
        VALUES (?, ?, 'tool_call', ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        sessionId,
        toolName,
        JSON.stringify(safeArgs),
        String(result || '').slice(0, 500),
        options.wasDestructive ? 1 : 0,
        options.requiredConfirmation ? 1 : 0,
        options.userConfirmed ? 1 : 0
      );
    } catch (e) {
      logger.warn('Audit log write failed', { error: e.message });
    }
  }

  /**
   * Remove sensitive fields from tool args before logging.
   */
  sanitizeArgs(toolName, toolArgs = {}) {
    const safe = { ...toolArgs };
    // Credential tools — never log passwords/api_keys
    if (toolName === 'credential_save') {
      delete safe.password;
      delete safe.api_key;
    }
    if (toolName === 'credential_get') {
      // Only log the service name
      return { service_name: safe.service_name };
    }
    return safe;
  }

  /**
   * Grant a permission to a user.
   */
  grantPermission(userId, permission) {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO max_permissions (user_id, permission, is_allowed)
      VALUES (?, ?, 1)
      ON CONFLICT(user_id, permission)
      DO UPDATE SET is_allowed = 1
    `).run(userId, permission);
    logger.info('Permission granted', { userId, permission });
    return `Permission granted: ${permission}`;
  }

  /**
   * Revoke a permission from a user.
   */
  revokePermission(userId, permission) {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO max_permissions (user_id, permission, is_allowed)
      VALUES (?, ?, 0)
      ON CONFLICT(user_id, permission)
      DO UPDATE SET is_allowed = 0
    `).run(userId, permission);
    logger.info('Permission revoked', { userId, permission });
    return `Permission revoked: ${permission}`;
  }

  /**
   * Create a pending confirmation record.
   */
  createPendingConfirmation(sessionId, userId, toolName, toolArgs, description, riskLevel) {
    const db = getDatabase();
    const id = `conf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO max_pending_confirmations
      (id, session_id, user_id, action_description, tool_name, tool_args, risk_level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, userId, description, toolName, JSON.stringify(toolArgs), riskLevel || 'medium');
    return id;
  }

  /**
   * Resolve a pending confirmation.
   */
  resolveConfirmation(confirmationId, approved) {
    const db = getDatabase();
    db.prepare(`
      UPDATE max_pending_confirmations
      SET status = ?, resolved_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(approved ? 'approved' : 'rejected', confirmationId);
    return approved;
  }

  /**
   * Check the status of a pending confirmation.
   */
  getConfirmationStatus(confirmationId) {
    const db = getDatabase();
    return db.prepare(
      'SELECT status FROM max_pending_confirmations WHERE id = ?'
    ).get(confirmationId);
  }

  /**
   * List recent audit log entries for a user.
   */
  listAuditLog(userId, limit = 20) {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM max_audit_log
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(userId, limit);
  }
}

// Singleton instance
export const permissionGuard = new PermissionGuard();
export default permissionGuard;
