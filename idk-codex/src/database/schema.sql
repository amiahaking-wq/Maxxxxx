-- ============================================================================
-- MAX Database Schema - Corrected Foreign Key Types
-- ============================================================================
-- CRITICAL: All tables referencing sessions(id) MUST use TEXT NOT NULL
-- Table creation order respects foreign key dependencies
-- ============================================================================

-- 1. Sessions table: Tracks user conversation sessions (NO dependencies)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT DEFAULT 'telegram' CHECK(platform IN ('telegram', 'web', 'cli')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active',
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  linked_issue TEXT,
  metadata TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Error patterns table: Error learning (NO dependencies)
CREATE TABLE IF NOT EXISTS error_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  error_signature TEXT NOT NULL UNIQUE,
  error_type TEXT NOT NULL,
  fix_description TEXT NOT NULL,
  success_count INTEGER DEFAULT 1,
  last_success_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Messages table: Stores conversation history
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 4. Agent runs table: Tracks agent execution phases
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('plan', 'execute', 'test', 'deploy', 'monitor')),
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed', 'retrying')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  metadata TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 5. Session handoffs table: For session continuity
CREATE TABLE IF NOT EXISTS session_handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  snapshot_data TEXT NOT NULL,
  token_usage_input INTEGER DEFAULT 0,
  token_usage_output INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resumed BOOLEAN DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 6. Audit logs table: Security tracking
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT,
  event_type TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  risk_level TEXT CHECK(risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

-- 7. MAX tasks table: Task tracking
CREATE TABLE IF NOT EXISTS max_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planning', 'executing', 'completed', 'failed')),
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 8. MAX milestones table: Milestone execution
CREATE TABLE IF NOT EXISTS max_milestones (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_role TEXT NOT NULL CHECK(agent_role IN ('architect', 'engineer', 'devops', 'media')),
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'completed', 'failed')),
  dependencies TEXT,
  context_size INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (task_id) REFERENCES max_tasks(id) ON DELETE CASCADE
);

-- 9. MAX context purges table: Context memory purging logs
CREATE TABLE IF NOT EXISTS max_context_purges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id TEXT NOT NULL,
  tokens_freed INTEGER NOT NULL,
  purged_at INTEGER NOT NULL,
  FOREIGN KEY (milestone_id) REFERENCES max_milestones(id) ON DELETE CASCADE
);

-- ============================================================================
-- Indexes for performance optimization
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_linked_issue ON sessions(linked_issue);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id, phase);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status, started_at);

CREATE INDEX IF NOT EXISTS idx_session_handoffs_session ON session_handoffs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_handoffs_created ON session_handoffs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_patterns_signature ON error_patterns(error_signature);
CREATE INDEX IF NOT EXISTS idx_error_patterns_type ON error_patterns(error_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_risk ON audit_logs(risk_level, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(event_type, timestamp);

CREATE INDEX IF NOT EXISTS idx_max_tasks_session ON max_tasks(session_id, status);
CREATE INDEX IF NOT EXISTS idx_max_tasks_status ON max_tasks(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_max_milestones_task ON max_milestones(task_id, status);
CREATE INDEX IF NOT EXISTS idx_max_milestones_agent ON max_milestones(agent_role, status);

CREATE INDEX IF NOT EXISTS idx_max_context_purges_milestone ON max_context_purges(milestone_id, purged_at DESC);
