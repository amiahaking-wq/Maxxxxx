/**
 * Teams API (Phase 15-16)
 *
 * Team lifecycle:
 *   POST   /api/teams              — create a team (owner)
 *   GET    /api/teams              — list teams current user belongs to
 *   GET    /api/teams/:id          — get team details (members only)
 *   PATCH  /api/teams/:id          — update team (owner/admin only)
 *   DELETE /api/teams/:id          — delete team (owner only)
 *
 * Members:
 *   GET    /api/teams/:id/members  — list members (members only)
 *   POST   /api/teams/:id/invite   — invite a user by email/userId (owner/admin)
 *   PATCH  /api/teams/:id/members/:userId — change member role (owner/admin)
 *   DELETE /api/teams/:id/members/:userId — remove member (owner/admin, or self-leave)
 *   POST   /api/teams/:id/accept   — accept a pending invitation
 *
 * Team conversations (Phase 16):
 *   GET    /api/teams/:id/conversations — list team's shared conversations
 *   POST   /api/teams/:id/conversations — share a conversation with the team
 */

import express from 'express';
import crypto from 'crypto';
import { getDatabase } from '../../database/db.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// ============================================================================
// Ensure tables exist (idempotent)
// ============================================================================
function ensureTables() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      owner_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);
    CREATE INDEX IF NOT EXISTS idx_teams_owner ON teams(owner_id);

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member')),
      invited_by TEXT,
      invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      joined_at DATETIME,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'removed')),
      UNIQUE(team_id, user_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id, status);
    CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id, status);

    CREATE TABLE IF NOT EXISTS team_conversations (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      shared_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_team_conversations_team ON team_conversations(team_id);
  `);
}
ensureTables();

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `team-${Date.now()}`;
}

function serializeTeam(row, memberCount = 0, myRole = null) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    ownerId: row.owner_id,
    memberCount,
    role: myRole, // current user's role in this team
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeMember(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    invitedBy: row.invited_by,
    invitedAt: row.invited_at,
    joinedAt: row.joined_at,
  };
}

// Helper: verify user is a member of the team (any status) + return their role
function getMemberRole(teamId, userId) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT role FROM team_members
    WHERE team_id = ? AND user_id = ? AND status = 'active'
  `).get(teamId, String(userId));
  return row?.role || null;
}

// Helper: verify user has owner/admin role
function requireAdminRole(teamId, userId) {
  const role = getMemberRole(teamId, userId);
  if (role !== 'owner' && role !== 'admin') return false;
  return true;
}

// ============================================================================
// POST /api/teams — create a team
// ============================================================================
router.post('/', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const { name, description, slug } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const id = crypto.randomUUID();
    let teamSlug = slug || slugify(name);
    // Ensure slug uniqueness
    const db = getDatabase();
    let suffix = 0;
    while (db.prepare('SELECT id FROM teams WHERE slug = ?').get(teamSlug)) {
      suffix++;
      teamSlug = `${slugify(name)}-${suffix}`;
    }

    db.prepare(`
      INSERT INTO teams (id, name, slug, description, owner_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name.trim(), teamSlug, description || '', String(userId));

    // Auto-add owner as a member with 'owner' role + 'active' status
    const memberId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO team_members (id, team_id, user_id, role, invited_by, joined_at, status)
      VALUES (?, ?, ?, 'owner', ?, CURRENT_TIMESTAMP, 'active')
    `).run(memberId, id, String(userId), String(userId));

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
    logger.info('Team created', { id, name, userId });
    res.json({ success: true, team: serializeTeam(team, 1, 'owner') });
  } catch (err) {
    logger.error('Failed to create team', { error: err.message });
    res.status(500).json({ error: 'Failed to create team: ' + err.message });
  }
});

// ============================================================================
// GET /api/teams — list teams user belongs to
// ============================================================================
router.get('/', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT t.*, tm.role as my_role,
             (SELECT COUNT(*) FROM team_members WHERE team_id = t.id AND status = 'active') as member_count
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ? AND tm.status = 'active'
      ORDER BY t.updated_at DESC
    `).all(String(userId));

    res.json({
      success: true,
      teams: rows.map(r => serializeTeam(r, r.member_count || 0, r.my_role)),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list teams: ' + err.message });
  }
});

// ============================================================================
// GET /api/teams/:id — get team details
// ============================================================================
router.get('/:id', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();

    const role = getMemberRole(req.params.id, userId);
    if (!role) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const memberCount = db.prepare(`SELECT COUNT(*) as c FROM team_members WHERE team_id = ? AND status = 'active'`).get(req.params.id);

    res.json({ success: true, team: serializeTeam(team, memberCount?.c || 0, role) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get team: ' + err.message });
  }
});

// ============================================================================
// PATCH /api/teams/:id — update team (owner/admin)
// ============================================================================
router.patch('/:id', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    if (!requireAdminRole(req.params.id, userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, description } = req.body || {};
    const db = getDatabase();

    db.prepare(`
      UPDATE teams SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name || null, description || null, req.params.id);

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
    res.json({ success: true, team: serializeTeam(team, 0, getMemberRole(req.params.id, userId)) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update team: ' + err.message });
  }
});

// ============================================================================
// DELETE /api/teams/:id — delete team (owner only)
// ============================================================================
router.delete('/:id', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const role = getMemberRole(req.params.id, userId);
    if (role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can delete a team' });
    }

    const db = getDatabase();
    db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
    logger.info('Team deleted', { id: req.params.id, userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete team: ' + err.message });
  }
});

// ============================================================================
// GET /api/teams/:id/members — list members
// ============================================================================
router.get('/:id/members', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    if (!getMemberRole(req.params.id, userId)) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM team_members WHERE team_id = ? AND status != 'removed'
      ORDER BY role = 'owner' DESC, role = 'admin' DESC, joined_at DESC
    `).all(req.params.id);

    res.json({ success: true, members: rows.map(serializeMember) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list members: ' + err.message });
  }
});

// ============================================================================
// POST /api/teams/:id/invite — invite a user (owner/admin)
// Body: { userId, email, role }
// ============================================================================
router.post('/:id/invite', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    if (!requireAdminRole(req.params.id, userId)) {
      return res.status(403).json({ error: 'Admin access required to invite' });
    }

    const { userId: inviteeId, email, role } = req.body || {};
    // Use email as userId if no explicit userId (simplified — in production
    // you'd look up the user by email)
    const targetUserId = inviteeId || email;
    if (!targetUserId) {
      return res.status(400).json({ error: 'userId or email is required' });
    }
    if (role && !['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin or member' });
    }

    const db = getDatabase();
    const memberId = crypto.randomUUID();
    try {
      db.prepare(`
        INSERT INTO team_members (id, team_id, user_id, role, invited_by, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(memberId, req.params.id, String(targetUserId), role || 'member', String(userId));
    } catch (e) {
      if (String(e).includes('UNIQUE')) {
        return res.status(409).json({ error: 'User already invited or is a member' });
      }
      throw e;
    }

    logger.info('Team invite sent', { teamId: req.params.id, targetUserId, by: userId });
    res.json({ success: true, memberId, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to invite: ' + err.message });
  }
});

// ============================================================================
// POST /api/teams/:id/accept — accept pending invitation
// ============================================================================
router.post('/:id/accept', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE team_members
      SET status = 'active', joined_at = CURRENT_TIMESTAMP
      WHERE team_id = ? AND user_id = ? AND status = 'pending'
    `).run(req.params.id, String(userId));

    if (result.changes === 0) {
      return res.status(404).json({ error: 'No pending invitation found' });
    }

    res.json({ success: true, status: 'active' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept invitation: ' + err.message });
  }
});

// ============================================================================
// PATCH /api/teams/:id/members/:userId — change role (owner/admin)
// ============================================================================
router.patch('/:id/members/:userId', (req, res) => {
  try {
    const requesterId = req.user?.id || 'web_user';
    if (!requireAdminRole(req.params.id, requesterId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { role } = req.body || {};
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin or member' });
    }

    // Can't change owner's role
    const db = getDatabase();
    const target = db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, req.params.userId);
    if (!target) return res.status(404).json({ error: 'Member not found' });
    if (target.role === 'owner') {
      return res.status(400).json({ error: 'Cannot change owner role' });
    }

    db.prepare(`
      UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?
    `).run(role, req.params.id, req.params.userId);

    res.json({ success: true, role });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role: ' + err.message });
  }
});

// ============================================================================
// DELETE /api/teams/:id/members/:userId — remove member (admin, or self-leave)
// ============================================================================
router.delete('/:id/members/:userId', (req, res) => {
  try {
    const requesterId = req.user?.id || 'web_user';
    const targetUserId = req.params.userId;

    // Self-leave allowed; otherwise need admin
    if (requesterId !== targetUserId && !requireAdminRole(req.params.id, requesterId)) {
      return res.status(403).json({ error: 'Admin access required to remove others' });
    }

    const db = getDatabase();
    const target = db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, targetUserId);
    if (!target) return res.status(404).json({ error: 'Member not found' });
    if (target.role === 'owner') {
      return res.status(400).json({ error: 'Owner cannot be removed (transfer ownership first)' });
    }

    db.prepare(`
      UPDATE team_members SET status = 'removed' WHERE team_id = ? AND user_id = ?
    `).run(req.params.id, targetUserId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member: ' + err.message });
  }
});

// ============================================================================
// GET /api/teams/:id/conversations — list team conversations (Phase 16)
// ============================================================================
router.get('/:id/conversations', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    if (!getMemberRole(req.params.id, userId)) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    const db = getDatabase();
    const rows = db.prepare(`
      SELECT tc.*, c.title, c.updated_at as conversation_updated_at
      FROM team_conversations tc
      JOIN conversations c ON c.id = tc.conversation_id
      WHERE tc.team_id = ?
      ORDER BY tc.created_at DESC
    `).all(req.params.id);

    res.json({
      success: true,
      conversations: rows.map(r => ({
        id: r.id,
        teamId: r.team_id,
        conversationId: r.conversation_id,
        conversationTitle: r.title,
        sharedBy: r.shared_by,
        createdAt: r.created_at,
        updatedAt: r.conversation_updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list team conversations: ' + err.message });
  }
});

// ============================================================================
// POST /api/teams/:id/conversations — share a conversation with the team
// Body: { conversationId }
// ============================================================================
router.post('/:id/conversations', (req, res) => {
  try {
    const userId = req.user?.id || 'web_user';
    if (!getMemberRole(req.params.id, userId)) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    const { conversationId } = req.body || {};
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const id = crypto.randomUUID();
    const db = getDatabase();
    db.prepare(`
      INSERT INTO team_conversations (id, team_id, conversation_id, shared_by)
      VALUES (?, ?, ?, ?)
    `).run(id, req.params.id, conversationId, String(userId));

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to share conversation: ' + err.message });
  }
});

export default router;
