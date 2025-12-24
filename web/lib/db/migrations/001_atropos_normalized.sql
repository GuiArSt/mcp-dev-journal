-- Migration: Normalize Atropos tables for better scalability
-- Date: 2024-12-24
-- Description: Creates new normalized tables for corrections, memories, dictionary, and stats

-- Create atropos_corrections table to store correction history
CREATE TABLE IF NOT EXISTS atropos_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  original_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  had_changes INTEGER DEFAULT 0,
  intent_questions TEXT DEFAULT '[]',
  source_context TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying corrections by user
CREATE INDEX IF NOT EXISTS idx_atropos_corrections_user_id ON atropos_corrections(user_id);
-- Index for querying by source (e.g., document slug)
CREATE INDEX IF NOT EXISTS idx_atropos_corrections_source ON atropos_corrections(source_context);
-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_atropos_corrections_created ON atropos_corrections(created_at DESC);

-- Create atropos_memories table (normalized from JSON array)
CREATE TABLE IF NOT EXISTS atropos_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  content TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  frequency INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying memories by user
CREATE INDEX IF NOT EXISTS idx_atropos_memories_user_id ON atropos_memories(user_id);
-- Unique constraint to prevent duplicate memories
CREATE UNIQUE INDEX IF NOT EXISTS idx_atropos_memories_unique ON atropos_memories(user_id, content);

-- Create atropos_dictionary table (normalized from JSON array)
CREATE TABLE IF NOT EXISTS atropos_dictionary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  term TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying dictionary by user
CREATE INDEX IF NOT EXISTS idx_atropos_dictionary_user_id ON atropos_dictionary(user_id);
-- Unique constraint to prevent duplicate terms
CREATE UNIQUE INDEX IF NOT EXISTS idx_atropos_dictionary_unique ON atropos_dictionary(user_id, term);

-- Create atropos_stats table for aggregate statistics
CREATE TABLE IF NOT EXISTS atropos_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  total_checks INTEGER DEFAULT 0,
  total_corrections INTEGER DEFAULT 0,
  total_characters_corrected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint on user_id for stats
CREATE UNIQUE INDEX IF NOT EXISTS idx_atropos_stats_user_id ON atropos_stats(user_id);
