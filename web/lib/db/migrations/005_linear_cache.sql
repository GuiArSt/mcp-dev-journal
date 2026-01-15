-- Linear Integration Cache Tables
-- Stores Linear Projects and Issues locally for historical preservation
-- Run with: sqlite3 journal.db < migrations/005_linear_cache.sql

-- Linear Projects table
CREATE TABLE IF NOT EXISTS linear_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT,
  state TEXT,
  progress REAL,
  target_date TEXT,
  start_date TEXT,
  url TEXT NOT NULL,
  lead_id TEXT,
  lead_name TEXT,
  team_ids TEXT DEFAULT '[]',
  member_ids TEXT DEFAULT '[]',
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Linear Issues table
CREATE TABLE IF NOT EXISTS linear_issues (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  priority INTEGER,
  state_id TEXT,
  state_name TEXT,
  assignee_id TEXT,
  assignee_name TEXT,
  team_id TEXT,
  team_name TEXT,
  team_key TEXT,
  project_id TEXT,
  project_name TEXT,
  parent_id TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_linear_projects_state ON linear_projects(state);
CREATE INDEX IF NOT EXISTS idx_linear_projects_deleted ON linear_projects(is_deleted);
CREATE INDEX IF NOT EXISTS idx_linear_projects_synced ON linear_projects(synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_linear_issues_assignee ON linear_issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_linear_issues_project ON linear_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_linear_issues_state ON linear_issues(state_name);
CREATE INDEX IF NOT EXISTS idx_linear_issues_deleted ON linear_issues(is_deleted);
CREATE INDEX IF NOT EXISTS idx_linear_issues_synced ON linear_issues(synced_at DESC);
