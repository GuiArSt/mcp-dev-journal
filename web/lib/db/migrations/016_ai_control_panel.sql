-- Migration: AI Control Panel — Prompt versioning + Muse config
-- Date: 2026-04-25
-- Description: Immutable prompt snapshots, active pointer, and Muse runtime config table.
--              The existing `prompts` table (008) stores live documents with its own versioning.
--              These new tables are purpose-built for the AI control-panel workflow where
--              edits create immutable snapshots and a separate pointer tracks which is active.

-- ai_prompt_versions: immutable content snapshots (append-only, never UPDATE content)
CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_slug TEXT    NOT NULL,
  version     INTEGER NOT NULL,
  content     TEXT    NOT NULL,
  config      TEXT    NOT NULL DEFAULT '{}',
  label       TEXT    NOT NULL DEFAULT 'draft',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  created_by  TEXT    NOT NULL DEFAULT 'system',
  UNIQUE(prompt_slug, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_slug ON ai_prompt_versions(prompt_slug);

-- ai_prompt_active: one row per slug, points to the active version
CREATE TABLE IF NOT EXISTS ai_prompt_active (
  prompt_slug TEXT PRIMARY KEY,
  version     INTEGER NOT NULL,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- muse_config: single-row parameter store for Muse runtime behaviour
CREATE TABLE IF NOT EXISTS muse_config (
  id                  INTEGER PRIMARY KEY CHECK (id = 1),
  provider            TEXT    NOT NULL DEFAULT 'openai',
  driver_model        TEXT    NOT NULL DEFAULT 'gpt-5.4',
  painter_model       TEXT    NOT NULL DEFAULT 'gpt-image-2',
  observe_model       TEXT    NOT NULL DEFAULT 'gemini-2.5-flash',
  tick_every          INTEGER NOT NULL DEFAULT 3,
  mood_size           TEXT    NOT NULL DEFAULT '1K',
  infographic_size    TEXT    NOT NULL DEFAULT '2K',
  mood_quality        TEXT    NOT NULL DEFAULT 'low',
  infographic_quality TEXT    NOT NULL DEFAULT 'high',
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seed the single muse_config row if it doesn't exist
INSERT OR IGNORE INTO muse_config (id) VALUES (1);
