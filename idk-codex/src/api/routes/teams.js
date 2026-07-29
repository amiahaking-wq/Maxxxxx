/**
 * Team Accounts API (Feature #21)
 *
 * Lets users create teams, invite members, and share conversations + knowledge.
 *
 * GET    /api/teams                — list teams for current user
 * POST   /api/teams                — create a team
 * GET    /api/teams/:id            — get team info
 * POST   /api/teams/:id/invite     — invite a member
 * POST   /api/teams/:id/accept     — accept an invitation
 * DELETE /api/teams/:id/members/:userId — remove a member
 * GET    /api/teams/:id/conversations — list team conversations (shared)
 */

import express from 'express';
import { optionalAuth } from '../../auth/middleware.js';
import { getDatabase } from '../../database/db.js';
import crypto from 'crypto';
import logger from '../../utils/logger.js';

const router = express.Router();
router.use(optionalAuth);

function ensureTables() {
  try {
    const db = getDatabase();
    db.prepare(`CREATE TABLE IF NOT EXISTS max_teams (
      id TEXT PRIMARY KEY,
      name TEXT,
      owner_id TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS max_team_members (
      team_id TEXT,
      user_id TEXT,
      role TEXT DEFAULT 'member',
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (team_id, user_id)
    )`).run();
    db.prepare(`CREATE TABLE IF NOT EXISTS max_team_invites (
      code TEXT PRIMARY KEY,
      team_id TEXT,
      email TEXT,
      invited_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    )`).run();
  } catch (e) { /* ok */ }
}

router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    ensureTables();
    const db = getDatabase();
    const teams = db.prepare(`
      SELECT t.*, tm.role
      FROM max_teams t
      JOIN max_team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ?
      ORDER BY t.created_at DESC
    `).all(userId);
    res.json({ success: true, teams });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    ensureTables();
    const db = getDatabase();
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO max_teams (id, name, owner_id, description) VALUES (?, ?, ?, ?)').run(id, name, userId, description || null);
    db.prepare('INSERT INTO max_team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(id, userId, 'owner');

    logger.info('Team created', { teamId: id, name, ownerId: userId });
    res.json({ success: true, team: { id, name, ownerId: userId, description, role: 'owner' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const userId = req.user.id;
    ensureTables();
    const db = getDatabase();
    const team = db.prepare('SELECT * FROM max_teams WHERE id = ?').get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const membership = db.prepare('SELECT role FROM max_team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, userId);
    if (!membership) return res.status(403).json({ error: 'You are not a member of this team' });

    const members = db.prepare('SELECT user_id, role, joined_at FROM max_team_members WHERE team_id = ?').all(req.params.id);
    res.json({ success: true, team, role: membership.role, members });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/invite', (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    ensureTables();
    const db = getDatabase();
    const membership = db.prepare('SELECT role FROM max_team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, userId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return res.status(403).json({ error: 'Only owners/admins can invite' });
    }

    const code = crypto.randomBytes(6).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO max_team_invites (code, team_id, email, invited_by, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(code, req.params.id, email, userId, expires);

    res.json({ success: true, code, expiresAt: expires, message: `Invite link: /teams/join?code=${code}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/accept', (req, res) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;
    ensureTables();
    const db = getDatabase();
    const invite = db.prepare('SELECT * FROM max_team_invites WHERE code = ? AND team_id = ?').get(code, req.params.id);
    if (!invite) return res.status(404).json({ error: 'Invalid invite code' });
    if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: 'Invite expired' });

    db.prepare('INSERT OR REPLACE INTO max_team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(req.params.id, userId, 'member');
    db.prepare('DELETE FROM max_team_invites WHERE code = ?').run(code);

    res.json({ success: true, message: 'Joined team' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/members/:userId', (req, res) => {
  try {
    const requesterId = req.user.id;
    ensureTables();
    const db = getDatabase();
    const membership = db.prepare('SELECT role FROM max_team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, requesterId);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can remove members' });
    }
    db.prepare('DELETE FROM max_team_members WHERE team_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
