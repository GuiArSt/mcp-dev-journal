-- Migration: AI Integration Library V1
-- Date: 2026-04-29
-- Description: Read-only index of external AI coding-agent configs, skills,
-- normalized logs, and Library-side Tartarus proposals.

CREATE TABLE IF NOT EXISTS ai_integrations (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  version TEXT,
  auth_status TEXT,
  source_paths TEXT DEFAULT '[]',
  config_summary TEXT,
  metadata TEXT DEFAULT '{}',
  last_scanned_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_path TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  metadata TEXT DEFAULT '{}',
  content_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(integration_key, kind, source_path)
);

CREATE TABLE IF NOT EXISTS ai_log_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration_key TEXT NOT NULL,
  stable_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  started_at TEXT,
  updated_at TEXT,
  message_count INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(integration_key, stable_id, source_path)
);

CREATE TABLE IF NOT EXISTS ai_log_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  timestamp TEXT,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  text TEXT NOT NULL,
  tooling TEXT,
  params TEXT DEFAULT '{}',
  source_event_type TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES ai_log_sessions(id) ON DELETE CASCADE,
  UNIQUE(session_id, sequence)
);

CREATE TABLE IF NOT EXISTS ai_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration_key TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_path TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  status TEXT DEFAULT 'draft',
  source_artifact_id INTEGER,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_artifacts_integration ON ai_artifacts(integration_key);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_integration ON ai_log_sessions(integration_key);
CREATE INDEX IF NOT EXISTS idx_ai_events_session ON ai_log_events(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_ai_proposals_integration ON ai_proposals(integration_key, status);
