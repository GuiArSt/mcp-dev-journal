/**
 * Database utility for web app
 * Shares the same database as the MCP server
 */

import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

let db: Database.Database | null = null;

function findDatabasePath(): string {
  // Search upwards from cwd to find the database
  let currentDir = process.cwd();

  // Try up to 5 levels up
  for (let i = 0; i < 5; i++) {
    // Check ./data/journal.db (new structure)
    const dataPath = path.join(currentDir, "data", "journal.db");
    if (fs.existsSync(dataPath)) {
      return dataPath;
    }

    // Check ./journal.db (legacy)
    const rootPath = path.join(currentDir, "journal.db");
    if (fs.existsSync(rootPath)) {
      return rootPath;
    }

    // Go up one level
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Reached root
    currentDir = parentDir;
  }

  // Fallback - return expected path for error message
  return path.join(process.cwd(), "data", "journal.db");
}

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = process.env.JOURNAL_DB_PATH
    ? path.resolve(process.env.JOURNAL_DB_PATH.replace(/^~/, os.homedir()))
    : findDatabasePath();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}. Please ensure the journal database exists.`);
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  // Initialize Repository schema immediately after database connection
  try {
    const { initRepositorySchema } = require("./db-schema");
    initRepositorySchema();
  } catch (error) {
    // Schema initialization is optional, don't fail if module doesn't exist yet
    console.warn("Repository schema not initialized:", error);
  }

  // Migrate journal entries schema
  try {
    migrateJournalEntriesSchema();
  } catch (error) {
    console.warn("Journal entries migration failed:", error);
  }

  return db;
}

// Alias for compatibility
export function initDatabase(): Database.Database {
  // getDatabase() already initializes the schema, so just return it
  return getDatabase();
}


/**
 * Migrate journal_entries table to add code_author and team_members fields
 */
export function migrateJournalEntriesSchema(): void {
  const database = getDatabase();
  
  try {
    // Add code_author column (author of the code being reviewed)
    database.exec(`
      ALTER TABLE journal_entries ADD COLUMN code_author TEXT;
    `);
    console.log("Added code_author column to journal_entries");
  } catch (error: any) {
    if (!error.message?.includes('duplicate column')) {
      console.warn("Could not add code_author column (may already exist):", error.message);
    }
  }
  
  try {
    // Add team_members column (JSON array of team member names)
    database.exec(`
      ALTER TABLE journal_entries ADD COLUMN team_members TEXT DEFAULT '[]';
    `);
    console.log("Added team_members column to journal_entries");
  } catch (error: any) {
    if (!error.message?.includes('duplicate column')) {
      console.warn("Could not add team_members column (may already exist):", error.message);
    }
  }
  
  // Set default code_author to author for existing entries
  try {
    database.exec(`
      UPDATE journal_entries 
      SET code_author = author 
      WHERE code_author IS NULL;
    `);
  } catch (error: any) {
    console.warn("Could not update existing entries:", error.message);
  }
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Export all entries and project summaries as SQL INSERT statements
 */
export function exportToSQL(outputPath: string): void {
  const database = getDatabase();

  const entries = database
    .prepare("SELECT * FROM journal_entries ORDER BY created_at ASC")
    .all() as any[];
  const summaries = database
    .prepare("SELECT * FROM project_summaries ORDER BY repository ASC")
    .all() as any[];
  const attachmentMetadata = database
    .prepare(
      `
    SELECT id, commit_hash, filename, mime_type, description, file_size, uploaded_at
    FROM entry_attachments ORDER BY uploaded_at ASC
  `
    )
    .all() as any[];

  let sql = `-- Journal Entries and Project Summaries SQL Backup
-- Generated: ${new Date().toISOString()}
-- Total entries: ${entries.length}
-- Total project summaries: ${summaries.length}
-- Total attachments: ${attachmentMetadata.length}

-- Project Summaries
`;

  for (const summary of summaries) {
    const values = [
      summary.repository,
      summary.git_url,
      summary.summary,
      summary.purpose,
      summary.architecture,
      summary.key_decisions,
      summary.technologies,
      summary.status,
      summary.linear_project_id || null,
      summary.linear_issue_id || null,
      summary.updated_at,
    ].map((v) => {
      if (v === null) return "NULL";
      if (typeof v === "string") {
        return `'${v.replace(/'/g, "''")}'`;
      }
      return String(v);
    });

    sql += `INSERT INTO project_summaries (repository, git_url, summary, purpose, architecture, key_decisions, technologies, status, linear_project_id, linear_issue_id, updated_at) VALUES (${values.join(", ")});\n`;
  }

  sql += "\n-- Journal Entries\n";

  for (const entry of entries) {
    const values = [
      entry.commit_hash,
      entry.repository,
      entry.branch,
      entry.author,
      entry.date,
      entry.why,
      entry.what_changed,
      entry.decisions,
      entry.technologies,
      entry.kronus_wisdom,
      entry.raw_agent_report,
      entry.created_at,
    ].map((v) => {
      if (v === null) return "NULL";
      if (typeof v === "string") {
        return `'${v.replace(/'/g, "''")}'`;
      }
      return String(v);
    });

    sql += `INSERT INTO journal_entries (commit_hash, repository, branch, author, date, why, what_changed, decisions, technologies, kronus_wisdom, raw_agent_report, created_at) VALUES (${values.join(", ")});\n`;
  }

  // Add attachment metadata
  sql += "\n-- Attachment Metadata (Binary data stored in database only)\n";
  for (const att of attachmentMetadata) {
    const desc = att.description ? ` - ${att.description}` : "";
    sql += `-- Attachment: ${att.filename} (${att.file_size} bytes, ${att.mime_type})${desc} for commit ${att.commit_hash}\n`;
  }

  fs.writeFileSync(outputPath, sql, "utf-8");
}

// Types
export interface JournalEntry {
  id: number;
  commit_hash: string;
  repository: string;
  branch: string;
  author: string; // Journal entry author (always the user)
  code_author?: string; // Author of the code being reviewed
  team_members?: string; // JSON array of team member names
  date: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
  raw_agent_report: string;
  created_at: string;
}

export interface Attachment {
  id: number;
  commit_hash: string;
  filename: string;
  mime_type: string;
  description: string | null;
  file_size: number;
  uploaded_at: string;
}










