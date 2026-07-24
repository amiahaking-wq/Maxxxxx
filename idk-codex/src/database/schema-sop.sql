-- SOP (Standard Operating Procedure) System Tables
-- Extension to existing database schema for Claude Code architecture

-- ============================================================================
-- SOP Worksheets
-- ============================================================================

/**
 * SOP Worksheets table
 * Tracks SOP worksheet execution for each session
 */
CREATE TABLE IF NOT EXISTS sop_worksheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  worksheet_slug TEXT NOT NULL UNIQUE,
  workflow_name TEXT NOT NULL DEFAULT 'standard-development-task',
  worksheet_path TEXT NOT NULL,
  task_description TEXT,
  repository TEXT,
  issue_number INTEGER,
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  error_message TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sop_worksheets_session ON sop_worksheets(session_id);
CREATE INDEX IF NOT EXISTS idx_sop_worksheets_user ON sop_worksheets(user_id);
CREATE INDEX IF NOT EXISTS idx_sop_worksheets_slug ON sop_worksheets(worksheet_slug);
CREATE INDEX IF NOT EXISTS idx_sop_worksheets_status ON sop_worksheets(status);

-- ============================================================================
-- SOP Step Progress
-- ============================================================================

/**
 * SOP step progress table
 * Tracks individual step completion within worksheets
 */
CREATE TABLE IF NOT EXISTS sop_step_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worksheet_id INTEGER NOT NULL,
  step_number INTEGER NOT NULL,
  substep_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
  started_at DATETIME,
  completed_at DATETIME,
  error_message TEXT,
  result_data TEXT, -- JSON data
  FOREIGN KEY (worksheet_id) REFERENCES sop_worksheets(id) ON DELETE CASCADE,
  UNIQUE(worksheet_id, step_number, substep_number)
);

CREATE INDEX IF NOT EXISTS idx_sop_step_progress_worksheet ON sop_step_progress(worksheet_id);
CREATE INDEX IF NOT EXISTS idx_sop_step_progress_status ON sop_step_progress(status);

-- ============================================================================
-- Specialist Agent Delegations
-- ============================================================================

/**
 * Specialist delegations table
 * Tracks task delegation to specialist agents
 */
CREATE TABLE IF NOT EXISTS specialist_delegations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worksheet_id INTEGER,
  session_id INTEGER NOT NULL,
  specialist_name TEXT NOT NULL,
  task_description TEXT NOT NULL,
  task_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, success, failed
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  duration_ms INTEGER,
  result_data TEXT, -- JSON result
  error_message TEXT,
  FOREIGN KEY (worksheet_id) REFERENCES sop_worksheets(id) ON DELETE SET NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_specialist_delegations_worksheet ON specialist_delegations(worksheet_id);
CREATE INDEX IF NOT EXISTS idx_specialist_delegations_session ON specialist_delegations(session_id);
CREATE INDEX IF NOT EXISTS idx_specialist_delegations_specialist ON specialist_delegations(specialist_name);
CREATE INDEX IF NOT EXISTS idx_specialist_delegations_status ON specialist_delegations(status);

-- ============================================================================
-- Specialist Performance Metrics
-- ============================================================================

/**
 * Specialist metrics table
 * Aggregated performance metrics for each specialist
 */
CREATE TABLE IF NOT EXISTS specialist_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  specialist_name TEXT NOT NULL UNIQUE,
  total_delegations INTEGER DEFAULT 0,
  successful_delegations INTEGER DEFAULT 0,
  failed_delegations INTEGER DEFAULT 0,
  average_duration_ms INTEGER DEFAULT 0,
  last_delegation_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_specialist_metrics_name ON specialist_metrics(specialist_name);

-- ============================================================================
-- SOP Configuration
-- ============================================================================

/**
 * SOP configuration table
 * Stores SOP workflow configurations
 */
CREATE TABLE IF NOT EXISTS sop_configurations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_name TEXT NOT NULL UNIQUE,
  workflow_definition TEXT NOT NULL, -- JSON workflow definition
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sop_configurations_name ON sop_configurations(workflow_name);
CREATE INDEX IF NOT EXISTS idx_sop_configurations_enabled ON sop_configurations(enabled);

-- ============================================================================
-- Insert Default Configurations
-- ============================================================================

INSERT OR IGNORE INTO sop_configurations (workflow_name, workflow_definition, enabled)
VALUES (
  'standard-development-task',
  '{"name":"standard-development-task","description":"Standard 9-step workflow for development tasks","steps":9}',
  1
);

INSERT OR IGNORE INTO sop_configurations (workflow_name, workflow_definition, enabled)
VALUES (
  'hotfix-workflow',
  '{"name":"hotfix-workflow","description":"Fast-tracked workflow for urgent fixes","steps":3}',
  1
);

-- ============================================================================
-- Triggers for Metrics Updates
-- ============================================================================

/**
 * Trigger: Update specialist metrics on delegation completion
 */
CREATE TRIGGER IF NOT EXISTS update_specialist_metrics_on_delegation
AFTER UPDATE OF status ON specialist_delegations
WHEN NEW.status IN ('success', 'failed') AND OLD.status NOT IN ('success', 'failed')
BEGIN
  INSERT INTO specialist_metrics (
    specialist_name,
    total_delegations,
    successful_delegations,
    failed_delegations,
    average_duration_ms,
    last_delegation_at,
    updated_at
  )
  VALUES (
    NEW.specialist_name,
    1,
    CASE WHEN NEW.status = 'success' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    COALESCE(NEW.duration_ms, 0),
    NEW.completed_at,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(specialist_name) DO UPDATE SET
    total_delegations = total_delegations + 1,
    successful_delegations = successful_delegations + (CASE WHEN NEW.status = 'success' THEN 1 ELSE 0 END),
    failed_delegations = failed_delegations + (CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END),
    average_duration_ms = (
      (average_duration_ms * total_delegations + COALESCE(NEW.duration_ms, 0))
      / (total_delegations + 1)
    ),
    last_delegation_at = NEW.completed_at,
    updated_at = CURRENT_TIMESTAMP;
END;

-- ============================================================================
-- Views for Easy Querying
-- ============================================================================

/**
 * View: Active SOP worksheets
 */
CREATE VIEW IF NOT EXISTS v_active_sop_worksheets AS
SELECT
  w.id,
  w.session_id,
  w.user_id,
  w.worksheet_slug,
  w.workflow_name,
  w.task_description,
  w.repository,
  w.status,
  w.created_at,
  COUNT(sp.id) as total_steps,
  SUM(CASE WHEN sp.status = 'completed' THEN 1 ELSE 0 END) as completed_steps,
  SUM(CASE WHEN sp.status = 'failed' THEN 1 ELSE 0 END) as failed_steps
FROM sop_worksheets w
LEFT JOIN sop_step_progress sp ON w.id = sp.worksheet_id
WHERE w.status = 'running'
GROUP BY w.id;

/**
 * View: Specialist performance summary
 */
CREATE VIEW IF NOT EXISTS v_specialist_performance AS
SELECT
  specialist_name,
  total_delegations,
  successful_delegations,
  failed_delegations,
  ROUND((successful_delegations * 100.0 / NULLIF(total_delegations, 0)), 2) as success_rate,
  average_duration_ms,
  last_delegation_at
FROM specialist_metrics
ORDER BY total_delegations DESC;

/**
 * View: Recent SOP activity
 */
CREATE VIEW IF NOT EXISTS v_recent_sop_activity AS
SELECT
  'worksheet' as activity_type,
  w.id as entity_id,
  w.worksheet_slug as entity_name,
  w.status,
  w.created_at as timestamp,
  NULL as specialist_name
FROM sop_worksheets w
UNION ALL
SELECT
  'delegation' as activity_type,
  d.id as entity_id,
  d.task_description as entity_name,
  d.status,
  d.started_at as timestamp,
  d.specialist_name
FROM specialist_delegations d
ORDER BY timestamp DESC
LIMIT 100;
