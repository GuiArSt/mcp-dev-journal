/**
 * In-memory SQLite database for testing
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/db/schema";

/**
 * Create an in-memory test database with schema
 */
export function createTestDb() {
  const sqlite = new Database(":memory:");

  // Enable foreign keys
  sqlite.pragma("foreign_keys = ON");

  // Create all tables
  sqlite.exec(`
    -- Journal entries
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_hash TEXT NOT NULL UNIQUE,
      repository TEXT NOT NULL,
      branch TEXT NOT NULL,
      author TEXT NOT NULL,
      code_author TEXT,
      team_members TEXT DEFAULT '[]',
      date TEXT NOT NULL,
      why TEXT NOT NULL,
      what_changed TEXT NOT NULL,
      decisions TEXT NOT NULL,
      technologies TEXT NOT NULL,
      kronus_wisdom TEXT,
      raw_agent_report TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Project summaries
    CREATE TABLE IF NOT EXISTS project_summaries (
      repository TEXT PRIMARY KEY,
      git_url TEXT,
      summary TEXT,
      purpose TEXT,
      architecture TEXT,
      key_decisions TEXT,
      technologies TEXT,
      status TEXT,
      linear_project_id TEXT,
      linear_issue_id TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Entry attachments
    CREATE TABLE IF NOT EXISTS entry_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_hash TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      description TEXT,
      file_size INTEGER NOT NULL,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (commit_hash) REFERENCES journal_entries(commit_hash) ON DELETE CASCADE
    );

    -- Documents
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('writing', 'prompt', 'note')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Skills
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      magnitude INTEGER NOT NULL CHECK(magnitude >= 1 AND magnitude <= 5),
      description TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      url TEXT,
      tags TEXT DEFAULT '[]',
      firstUsed TEXT,
      lastUsed TEXT
    );

    -- Conversations
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return drizzle(sqlite, { schema });
}

/**
 * Seed test data
 */
export function seedTestData(db: ReturnType<typeof createTestDb>) {
  // Add sample journal entry
  const sqlite = (db as any).session.client as Database.Database;

  sqlite
    .prepare(
      `
    INSERT INTO journal_entries (commit_hash, repository, branch, author, date, why, what_changed, decisions, technologies, raw_agent_report)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      "abc1234567890",
      "test-repo",
      "main",
      "Test Author",
      "2024-01-15",
      "Testing the system",
      "Added test fixtures",
      "Use in-memory SQLite for tests",
      "TypeScript, Vitest, Drizzle",
      "Raw report content here"
    );

  return db;
}
