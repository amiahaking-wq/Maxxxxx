-- ============================================================================
-- Phase 12 — Conversation Sharing
-- Run this migration to add shared_links table for public conversation sharing.
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared_links (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT,
  -- Snapshot of messages at time of sharing (JSON array)
  -- We snapshot instead of referencing live data so shared links stay
  -- stable even if the original conversation is deleted or modified.
  messages_snapshot TEXT NOT NULL DEFAULT '[]',
  -- Optional expiration (NULL = never expires)
  expires_at DATETIME,
  -- View tracking
  view_count INTEGER DEFAULT 0,
  last_viewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shared_links_user ON shared_links(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_links_conversation ON shared_links(conversation_id);

-- ============================================================================
-- Phase 13 — Custom GPTs
-- ============================================================================

CREATE TABLE IF NOT EXISTS gpts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  system_prompt TEXT,
  -- JSON array of knowledge file paths (relative to uploads dir)
  knowledge_files TEXT DEFAULT '[]',
  -- JSON array of tool names this GPT can use (null = all tools)
  allowed_tools TEXT,
  -- Icon appearance
  icon_color TEXT DEFAULT '#10a37f',
  -- Visibility: 'private' (only owner), 'public' (in store)
  visibility TEXT DEFAULT 'private' CHECK(visibility IN ('private', 'public')),
  category TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gpts_user ON gpts(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gpts_public ON gpts(visibility, usage_count DESC) WHERE visibility = 'public';

-- ============================================================================
-- Phase 15 — Teams
-- ============================================================================

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

-- Team conversations (shared within a team workspace)
CREATE TABLE IF NOT EXISTS team_conversations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  shared_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_team_conversations_team ON team_conversations(team_id);
