/**
 * Per-session WorkspaceContext cache.
 *
 * Building a workspace index for a large repo is expensive (file walk + reads),
 * so we cache one WorkspaceContext per session and reuse it across phases.
 *
 * Invalidation rules:
 *   - Whenever the agent writes or deletes a file, call invalidate(sessionId).
 *   - Whenever a brand-new task starts, the caller can call invalidate(sessionId)
 *     to force a re-index (in case the previous task changed files outside the
 *     agent's view), or pass { forceRefresh: true } to getContext.
 */

import path from 'path';
import { WorkspaceContext } from './workspace-context.js';
import logger from '../utils/logger.js';

const cache = new Map(); // sessionId -> { ctx, workspacePath, lastUsed }

/**
 * Resolve the workspace path for a session.
 * Priority: WORKSPACE_PATH env -> SANDBOX_WORKSPACE env -> ./sandbox-workspace
 * @returns {string}
 */
export function getDefaultWorkspacePath() {
  return process.env.WORKSPACE_PATH ||
    process.env.SANDBOX_WORKSPACE ||
    path.resolve(process.cwd(), 'sandbox-workspace');
}

/**
 * Get or create a cached WorkspaceContext for a session.
 * @param {string} sessionId
 * @param {string} [workspacePath] - optional override; defaults to env
 * @param {Object} [options] - passed through to buildWorkspaceContext
 * @param {boolean} [forceRefresh=false] - if true, invalidate cached entry first
 * @returns {WorkspaceContext}
 */
export function getSessionWorkspace(sessionId, workspacePath, options = {}, forceRefresh = false) {
  if (!sessionId) {
    // No session id -> ephemeral context, not cached
    return new WorkspaceContext(workspacePath || getDefaultWorkspacePath(), options);
  }

  const resolvedWorkspace = workspacePath || getDefaultWorkspacePath();

  if (forceRefresh) {
    cache.delete(sessionId);
  }

  let entry = cache.get(sessionId);
  if (!entry || entry.workspacePath !== resolvedWorkspace) {
    const ctx = new WorkspaceContext(resolvedWorkspace, options);
    entry = { ctx, workspacePath: resolvedWorkspace, lastUsed: Date.now() };
    cache.set(sessionId, entry);
    logger.info('WorkspaceContext cache: created entry', {
      sessionId,
      workspacePath: resolvedWorkspace
    });
  } else {
    entry.lastUsed = Date.now();
  }

  return entry.ctx;
}

/**
 * Invalidate the cached WorkspaceContext for a session.
 * Call this after the agent writes/removes files so the next getContext call
 * re-indexes the workspace.
 * @param {string} sessionId
 */
export function invalidateSessionWorkspace(sessionId) {
  if (cache.delete(sessionId)) {
    logger.debug('WorkspaceContext cache: invalidated', { sessionId });
  }
}

/**
 * Drop all cached contexts. Useful in tests.
 */
export function clearAllSessionWorkspaces() {
  cache.clear();
  logger.debug('WorkspaceContext cache: cleared all entries');
}

/**
 * Get cache stats (for debugging / monitoring).
 */
export function getCacheStats() {
  return {
    entries: cache.size,
    sessions: Array.from(cache.entries()).map(([id, e]) => ({
      sessionId: id,
      workspacePath: e.workspacePath,
      lastUsed: new Date(e.lastUsed).toISOString(),
      hasCache: !!e.ctx.cache
    }))
  };
}

export default {
  getDefaultWorkspacePath,
  getSessionWorkspace,
  invalidateSessionWorkspace,
  clearAllSessionWorkspaces,
  getCacheStats
};
