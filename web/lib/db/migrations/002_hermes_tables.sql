-- Migration: Create Hermes translation system tables
-- Date: 2024-12-24
-- Description: Creates tables for translation history, memories, dictionary, and stats

-- Create hermes_translations table to store translation history
CREATE TABLE IF NOT EXISTS hermes_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'neutral' CHECK(tone IN ('formal', 'neutral', 'slang')),
  had_changes INTEGER DEFAULT 1,
  clarification_questions TEXT DEFAULT '[]',
  source_context TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying translations by user
CREATE INDEX IF NOT EXISTS idx_hermes_translations_user_id ON hermes_translations(user_id);
-- Index for querying by language pair
CREATE INDEX IF NOT EXISTS idx_hermes_translations_languages ON hermes_translations(source_language, target_language);
-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_hermes_translations_created ON hermes_translations(created_at DESC);
-- Index for source context queries
CREATE INDEX IF NOT EXISTS idx_hermes_translations_source ON hermes_translations(source_context);

-- Create hermes_memories table (learned translation patterns)
CREATE TABLE IF NOT EXISTS hermes_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  content TEXT NOT NULL,
  source_language TEXT,
  target_language TEXT,
  tags TEXT DEFAULT '[]',
  frequency INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying memories by user
CREATE INDEX IF NOT EXISTS idx_hermes_memories_user_id ON hermes_memories(user_id);
-- Unique constraint to prevent duplicate memories
CREATE UNIQUE INDEX IF NOT EXISTS idx_hermes_memories_unique ON hermes_memories(user_id, content);
-- Index for language-specific queries
CREATE INDEX IF NOT EXISTS idx_hermes_memories_languages ON hermes_memories(source_language, target_language);

-- Create hermes_dictionary table (protected terms)
CREATE TABLE IF NOT EXISTS hermes_dictionary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  term TEXT NOT NULL,
  preserve_as TEXT,
  source_language TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying dictionary by user
CREATE INDEX IF NOT EXISTS idx_hermes_dictionary_user_id ON hermes_dictionary(user_id);
-- Unique constraint to prevent duplicate terms per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_hermes_dictionary_unique ON hermes_dictionary(user_id, term);

-- Create hermes_stats table for aggregate statistics
CREATE TABLE IF NOT EXISTS hermes_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  total_translations INTEGER DEFAULT 0,
  total_characters_translated INTEGER DEFAULT 0,
  language_pairs_used TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint on user_id for stats
CREATE UNIQUE INDEX IF NOT EXISTS idx_hermes_stats_user_id ON hermes_stats(user_id);
