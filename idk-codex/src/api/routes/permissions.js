/**
 * Permissions API Routes — Stage 6
 *
 * POST /api/permissions/confirm    — approve or reject a pending confirmation
 * GET  /api/permissions            — list user's permissions
 * POST /api/permissions/grant      — grant a permission
 * POST /api/permissions/revoke     — revoke a permission
 * GET  /api/permissions/audit      — view audit log
 * GET  /api/permissions/pending    — list pending confirmations
 */

import express from 'express';
import { permissionGuard } from '../../security/permission-guard.js';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * POST /api/permissions/confirm
 * Resolve a pending confirmation (approve or reject).
 * Called by the frontend when the user clicks "Allow" or "Deny" on the
 * confirmation dialog.
 *
 * Body: { confirmationId, approved }
 */
router.post('/confirm', (req, res) => {
  try {
    const { confirmationId, approved } = req.body;
    if (!confirmationId) {
      return res.status(400).json({ error: 'confirmationId is required' });
    }

    const result = permissionGuard.resolveConfirmation(confirmationId, approved === true || approved === 'true');
    logger.info('Confirmation resolved', { confirmationId, approved: result });

    res.json({ success: true, approved: result });
  } catch (err) {
    logger.error('Confirm endpoint failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/permissions
 * List all permissions for the current user.
 */
router.get('/', (req, res) => {
  try {
    const userId = req.query.userId || 'default-user';
    const db = getDatabase();
    const perms = db.prepare('SELECT * FROM max_permissions WHERE user_id = ?').all(userId);
    res.json({ success: true, permissions: perms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/permissions/grant
 * Grant a permission to a user.
 * Body: { permission, userId }
 */
router.post('/grant', (req, res) => {
  try {
    const userId = req.body.userId || 'default-user';
    const { permission } = req.body;
    if (!permission) return res.status(400).json({ error: 'permission is required' });
    const result = permissionGuard.grantPermission(userId, permission);
    res.json({ success: true, message: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/permissions/revoke
 * Revoke a permission from a user.
 * Body: { permission, userId }
 */
router.post('/revoke', (req, res) => {
  try {
    const userId = req.body.userId || 'default-user';
    const { permission } = req.body;
    if (!permission) return res.status(400).json({ error: 'permission is required' });
    const result = permissionGuard.revokePermission(userId, permission);
    res.json({ success: true, message: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/permissions/audit
 * View the audit log for the current user.
 */
router.get('/audit', (req, res) => {
  try {
    const userId = req.query.userId || 'default-user';
    const limit = parseInt(req.query.limit) || 50;
    const logs = permissionGuard.listAuditLog(userId, limit);
    res.json({ success: true, auditLog: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/permissions/pending
 * List pending confirmations for a session.
 */
router.get('/pending', (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.json({ success: true, pending: [] });
    const db = getDatabase();
    const pending = db.prepare(`
      SELECT * FROM max_pending_confirmations
      WHERE session_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(sessionId);
    res.json({ success: true, pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
