/**
 * Journal Database Module
 *
 * Security Note: SQL Injection Protection
 * ======================================
 * All queries use parameterized statements with better-sqlite3's prepared statements.
 * - Named parameters (@param) for complex queries
 * - Positional parameters (?) for simple queries
 * - NO string concatenation or template literals in SQL
 *
 * This protects against SQL injection attacks by separating SQL logic from data values.
 * The database driver handles proper escaping automatically.
 *
 * Examples:
 * ✅ SAFE:   db.prepare('SELECT * FROM entries WHERE id = ?').get(userId)
 * ✅ SAFE:   db.prepare('INSERT INTO entries (...) VALUES (@field)').run({field: value})
 * ❌ UNSAFE: db.exec(`SELECT * FROM entries WHERE id = ${userId}`)
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveMonorepoRootFromImportMeta } from "../../../shared/project-root.js";

import { logger } from "../../../shared/logger.js";
import { normalizeRepository } from "../../../shared/types.js";
import type {
  JournalEntry,
  JournalEntryInsert,
  ProjectSummary,
  ProjectSummaryInsert,
  Attachment,
  AttachmentInsert,
  ProjectSummaryV2,
  SectionsJson,
  SectionWithHistory,
  AllSection,
} from "../types.js";
import { CURRENT_SCHEMA_VERSION } from "../types.js";

let db: Database.Database | null = null;

/**
 * Get MCP server installation directory (where the code is located)
 * This is different from process.cwd() which returns where the agent is running from
 */
function getMCPInstallationRoot(): string {
  return resolveMonorepoRootFromImportMeta(import.meta.url);
}

const ensureDirectoryExists = (filePath: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const createSchema = (handle: Database.Database) => {
  handle.exec(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_hash TEXT UNIQUE NOT NULL,
      repository TEXT NOT NULL,
      branch TEXT NOT NULL,
      author TEXT NOT NULL,
      date TEXT NOT NULL,
      why TEXT NOT NULL,
      what_changed TEXT NOT NULL,
      decisions TEXT NOT NULL,
      technologies TEXT NOT NULL,
      kronus_wisdom TEXT,
      raw_agent_report TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  handle.exec(`
    CREATE TABLE IF NOT EXISTS repository_overviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repository TEXT UNIQUE NOT NULL,
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
  `);

  handle.exec(`
    CREATE TABLE IF NOT EXISTS entry_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_hash TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      description TEXT,
      data BLOB NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (commit_hash) REFERENCES journal_entries(commit_hash) ON DELETE CASCADE
    );
  `);

  // Migration: Fix repository_overviews NOT NULL constraints on existing databases
  // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
  try {
    // Check if we need to migrate (check if git_url has NOT NULL constraint)
    const tableInfo = handle
      .prepare("PRAGMA table_info(repository_overviews)")
      .all() as Array<{ name: string; notnull: number }>;
    const gitUrlColumn = tableInfo.find((col) => col.name === "git_url");

    if (gitUrlColumn && gitUrlColumn.notnull === 1) {
      logger.info("Migrating repository_overviews to make columns nullable...");

      // Create new table with nullable columns
      handle.exec(`
        CREATE TABLE IF NOT EXISTS repository_overviews_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repository TEXT UNIQUE NOT NULL,
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
      `);

      // Copy data from old table
      handle.exec(`
        INSERT INTO repository_overviews_new (id, repository, git_url, summary, purpose, architecture, key_decisions, technologies, status, linear_project_id, linear_issue_id, updated_at)
        SELECT id, repository, git_url, summary, purpose, architecture, key_decisions, technologies, status, linear_project_id, linear_issue_id, updated_at
        FROM repository_overviews;
      `);

      // Drop old table and rename new one
      handle.exec(`DROP TABLE repository_overviews;`);
      handle.exec(
        `ALTER TABLE repository_overviews_new RENAME TO repository_overviews;`,
      );

      logger.success("Successfully migrated repository_overviews table");
    }
  } catch (error: any) {
    logger.warn(
      "Could not migrate repository_overviews (may already be correct):",
      error.message,
    );
  }

  // Migrate existing tables: add description column if it doesn't exist
  try {
    handle.exec(`ALTER TABLE entry_attachments ADD COLUMN description TEXT;`);
  } catch (error: any) {
    // Column already exists, ignore error
    if (!error.message?.includes("duplicate column")) {
      logger.warn(
        "Could not add description column (may already exist):",
        error.message,
      );
    }
  }

  // Migrate existing tables: add Linear integration columns if they don't exist
  try {
    handle.exec(
      `ALTER TABLE repository_overviews ADD COLUMN linear_project_id TEXT;`,
    );
  } catch (error: any) {
    if (!error.message?.includes("duplicate column")) {
      logger.warn(
        "Could not add linear_project_id column (may already exist):",
        error.message,
      );
    }
  }

  try {
    handle.exec(
      `ALTER TABLE repository_overviews ADD COLUMN linear_issue_id TEXT;`,
    );
  } catch (error: any) {
    if (!error.message?.includes("duplicate column")) {
      logger.warn(
        "Could not add linear_issue_id column (may already exist):",
        error.message,
      );
    }
  }

  // Migration: Linear cache tables (005_linear_cache)
  try {
    handle.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_linear_projects_state ON linear_projects(state);
      CREATE INDEX IF NOT EXISTS idx_linear_projects_deleted ON linear_projects(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_linear_projects_synced ON linear_projects(synced_at DESC);

      CREATE INDEX IF NOT EXISTS idx_linear_issues_assignee ON linear_issues(assignee_id);
      CREATE INDEX IF NOT EXISTS idx_linear_issues_project ON linear_issues(project_id);
      CREATE INDEX IF NOT EXISTS idx_linear_issues_state ON linear_issues(state_name);
      CREATE INDEX IF NOT EXISTS idx_linear_issues_deleted ON linear_issues(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_linear_issues_synced ON linear_issues(synced_at DESC);
    `);
    logger.info("Linear cache tables migrated");
  } catch (error: any) {
    logger.warn("Could not migrate Linear cache tables:", error.message);
  }

  // Migration: Slite cache table (006_slite_cache)
  try {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS slite_notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        parent_note_id TEXT,
        url TEXT,
        owner_id TEXT,
        owner_name TEXT,
        review_state TEXT,
        note_type TEXT,
        summary TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_edited_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_slite_notes_parent ON slite_notes(parent_note_id);
      CREATE INDEX IF NOT EXISTS idx_slite_notes_deleted ON slite_notes(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_slite_notes_synced ON slite_notes(synced_at DESC);
    `);
    logger.info("Slite cache table migrated");
  } catch (error: any) {
    logger.warn("Could not migrate Slite cache table:", error.message);
  }

  // Migration: Notion cache table (007_notion_cache)
  try {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS notion_pages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        parent_id TEXT,
        parent_type TEXT,
        url TEXT,
        created_by TEXT,
        created_by_name TEXT,
        last_edited_by TEXT,
        last_edited_by_name TEXT,
        icon TEXT,
        cover_url TEXT,
        archived INTEGER DEFAULT 0,
        summary TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_edited_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notion_pages_parent ON notion_pages(parent_id);
      CREATE INDEX IF NOT EXISTS idx_notion_pages_deleted ON notion_pages(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_notion_pages_synced ON notion_pages(synced_at DESC);
    `);
    logger.info("Notion cache table migrated");
  } catch (error: any) {
    logger.warn("Could not migrate Notion cache table:", error.message);
  }

  // Migration: Living Project Summary (Entry 0) - Enhanced fields for repository_overviews
  const entry0Columns = [
    "file_structure TEXT", // Git-style file tree (agent-provided)
    "tech_stack TEXT", // Frameworks, libraries, versions (indicative)
    "frontend TEXT", // FE patterns, components, state management
    "backend TEXT", // BE routes, middleware, auth patterns
    "database_info TEXT", // Schema, ORM patterns, migrations
    "services TEXT", // External APIs, integrations
    "custom_tooling TEXT", // Project-specific utilities
    "data_flow TEXT", // How data is processed
    "patterns TEXT", // Naming conventions, code style
    "commands TEXT", // Dev, deploy, make commands
    "extended_notes TEXT", // Gotchas, TODOs, historical context
    "last_synced_entry TEXT", // Last journal entry hash used for update
    "entries_synced INTEGER", // Count of entries analyzed
  ];

  for (const column of entry0Columns) {
    const [columnName] = column.split(" ");
    try {
      handle.exec(`ALTER TABLE repository_overviews ADD COLUMN ${column};`);
      logger.debug(`Added column ${columnName} to repository_overviews`);
    } catch (error: any) {
      if (!error.message?.includes("duplicate column")) {
        logger.warn(
          `Could not add ${columnName} column (may already exist):`,
          error.message,
        );
      }
    }
  }

  // Migration: Add files_changed column to journal_entries for tracking file changes
  try {
    handle.exec(`ALTER TABLE journal_entries ADD COLUMN files_changed TEXT;`);
    logger.debug("Added column files_changed to journal_entries");
  } catch (error: any) {
    if (!error.message?.includes("duplicate column")) {
      logger.warn(
        "Could not add files_changed column (may already exist):",
        error.message,
      );
    }
  }

  // Migration: Add code_author and team_members columns (align with Drizzle schema)
  try {
    handle.exec(`ALTER TABLE journal_entries ADD COLUMN code_author TEXT;`);
    logger.debug("Added column code_author to journal_entries");
  } catch (error: any) {
    if (!error.message?.includes("duplicate column")) {
      logger.warn(
        "Could not add code_author column (may already exist):",
        error.message,
      );
    }
  }

  try {
    handle.exec(
      `ALTER TABLE journal_entries ADD COLUMN team_members TEXT DEFAULT '[]';`,
    );
    logger.debug("Added column team_members to journal_entries");
  } catch (error: any) {
    if (!error.message?.includes("duplicate column")) {
      logger.warn(
        "Could not add team_members column (may already exist):",
        error.message,
      );
    }
  }

  // Migration: Entry 0 v2 — sections_json, schema_version, last_scanned_commit, total_updates
  const v2Columns = [
    "schema_version INTEGER DEFAULT 1",
    "sections_json TEXT",        // JSON blob: Record<AllSection, SectionWithHistory>
    "last_scanned_commit TEXT",  // commit hash of last technical update
    "total_updates INTEGER DEFAULT 0",
  ];

  for (const column of v2Columns) {
    const [columnName] = column.split(" ");
    try {
      handle.exec(`ALTER TABLE repository_overviews ADD COLUMN ${column};`);
      logger.debug(`Added v2 column ${columnName} to repository_overviews`);
    } catch (error: any) {
      if (!error.message?.includes("duplicate column")) {
        logger.warn(
          `Could not add ${columnName} column (may already exist):`,
          error.message,
        );
      }
    }
  }

  // Migration: Add summary columns to all tables for Kronus indexing
  const summaryMigrations = [
    { table: "journal_entries", column: "summary TEXT" },
    { table: "linear_projects", column: "summary TEXT" },
    { table: "linear_issues", column: "summary TEXT" },
    { table: "entry_attachments", column: "summary TEXT" },
  ];

  for (const { table, column } of summaryMigrations) {
    try {
      handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column};`);
      logger.debug(`Added summary column to ${table}`);
    } catch (error: any) {
      if (!error.message?.includes("duplicate column")) {
        logger.warn(
          `Could not add summary to ${table} (may already exist):`,
          error.message,
        );
      }
    }
  }

  handle.exec(
    `CREATE INDEX IF NOT EXISTS idx_repository ON journal_entries(repository);`,
  );
  handle.exec(
    `CREATE INDEX IF NOT EXISTS idx_branch ON journal_entries(repository, branch);`,
  );
  handle.exec(
    `CREATE INDEX IF NOT EXISTS idx_commit ON journal_entries(commit_hash);`,
  );
  handle.exec(
    `CREATE INDEX IF NOT EXISTS idx_project_repo ON repository_overviews(repository);`,
  );
  handle.exec(
    `CREATE INDEX IF NOT EXISTS idx_attachments_commit ON entry_attachments(commit_hash);`,
  );

  // Tartarus Object Registry — universal index for all data objects
  handle.exec(`
    CREATE TABLE IF NOT EXISTS tartarus_objects (
      uuid TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      tags TEXT DEFAULT '[]',
      importance INTEGER DEFAULT 0,
      estimated_tokens INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_table, source_id)
    )
  `);
  handle.exec(`CREATE INDEX IF NOT EXISTS idx_tartarus_objects_type ON tartarus_objects(type)`);
  handle.exec(`CREATE INDEX IF NOT EXISTS idx_tartarus_objects_source ON tartarus_objects(source_table, source_id)`);

  // Object history — append-only snapshots for version tracking
  handle.exec(`
    CREATE TABLE IF NOT EXISTS tartarus_object_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      object_uuid TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      changed_by TEXT DEFAULT 'system',
      change_summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (object_uuid) REFERENCES tartarus_objects(uuid) ON DELETE CASCADE
    )
  `);
  handle.exec(`CREATE INDEX IF NOT EXISTS idx_object_history_uuid ON tartarus_object_history(object_uuid)`);

  // AI Integration Library — read-only index populated by the web scanner
  handle.exec(`
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
  `);
  handle.exec(`CREATE INDEX IF NOT EXISTS idx_ai_artifacts_integration ON ai_artifacts(integration_key)`);
  handle.exec(`CREATE INDEX IF NOT EXISTS idx_ai_sessions_integration ON ai_log_sessions(integration_key)`);
  handle.exec(`CREATE INDEX IF NOT EXISTS idx_ai_events_session ON ai_log_events(session_id, sequence)`);
  handle.exec(`CREATE INDEX IF NOT EXISTS idx_ai_proposals_integration ON ai_proposals(integration_key, status)`);
};

/** Rename legacy `project_summaries` → `repository_overviews` before schema DDL (idempotent). */
function migrateProjectSummariesToRepositoryOverviews(handle: Database.Database): void {
  const LEGACY = "project_summaries";
  const CURRENT = "repository_overviews";
  const old = handle
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    )
    .get(LEGACY) as { name: string } | undefined;
  const neu = handle
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    )
    .get(CURRENT) as { name: string } | undefined;
  if (old && !neu) {
    handle.exec(`ALTER TABLE ${LEGACY} RENAME TO ${CURRENT};`);
    logger.success(`Renamed table ${LEGACY} → ${CURRENT}`);
  }
  try {
    handle.exec(
      `UPDATE tartarus_objects SET source_table = '${CURRENT}' WHERE source_table = '${LEGACY}';`,
    );
  } catch {
    // registry table may not exist yet
  }
}

/** Rename legacy monorepo repository labels to tartarus-workspace (matches normalizeRepository). */
function runLegacyMonorepoRepositoryRenames(handle: Database.Database): void {
  const renames: Array<[string, string]> = [
    ["Developer Journal Workspace", "tartarus-workspace"],
    ["developer journal workspace", "tartarus-workspace"],
  ];
  const tables = [
    "journal_entries",
    "repository_overviews",
    "athena_learning_items",
    "athena_sessions",
  ] as const;
  for (const table of tables) {
    const row = handle
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(table);
    if (!row) continue;
    for (const [from, to] of renames) {
      try {
        handle
          .prepare(`UPDATE ${table} SET repository = ? WHERE repository = ?`)
          .run(to, from);
      } catch {
        // ignore
      }
    }
  }
}

export const initDatabase = (dbPath?: string): Database.Database => {
  if (db) {
    return db;
  }

  // Default to MCP server installation directory (data/journal.db)
  // Use the MCP server's location, not process.cwd() (which is where the agent is running)
  const mcpRoot = getMCPInstallationRoot();

  const finalPath = dbPath
    ? path.resolve(dbPath.replace(/^~/, os.homedir()))
    : path.join(mcpRoot, "data", "journal.db");

  ensureDirectoryExists(finalPath);

  // Retry logic for DB lock
  let retries = 5;
  let lastError: Error | null = null;

  while (retries > 0) {
    try {
      db = new Database(finalPath);
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      db.pragma("busy_timeout = 5000"); // Wait 5 seconds for locks
      migrateProjectSummariesToRepositoryOverviews(db);
      createSchema(db);
      runLegacyMonorepoRepositoryRenames(db);
      logger.success(`Journal database ready at ${finalPath}`);
      return db;
    } catch (error) {
      lastError = error as Error;
      db = null;
      retries--;
      if (retries > 0) {
        logger.warn(`Database locked, retrying... (${retries} attempts left)`);
        // Wait 500ms before retry
        const now = Date.now();
        while (Date.now() - now < 500) {
          // Busy wait
        }
      }
    }
  }

  throw new Error(
    `Failed to initialize database after retries: ${lastError?.message}`,
  );
};

const mapRow = (row: any): JournalEntry => ({
  id: row.id,
  commit_hash: row.commit_hash,
  repository: row.repository,
  branch: row.branch,
  author: row.author,
  code_author: row.code_author ?? null,
  team_members: row.team_members ?? "[]",
  date: row.date,
  why: row.why,
  what_changed: row.what_changed,
  decisions: row.decisions,
  technologies: row.technologies,
  kronus_wisdom: row.kronus_wisdom ?? null,
  raw_agent_report: row.raw_agent_report,
  created_at: row.created_at,
  // Parse files_changed JSON if present
  files_changed: row.files_changed ? JSON.parse(row.files_changed) : null,
  // AI-generated summary for Kronus indexing
  summary: row.summary ?? null,
});

export const insertJournalEntry = (entry: JournalEntryInsert): number => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const params = {
    commit_hash: entry.commit_hash,
    repository: normalizeRepository(entry.repository),
    branch: entry.branch,
    author: entry.author,
    date: entry.date,
    why: entry.why,
    what_changed: entry.what_changed,
    decisions: entry.decisions,
    technologies: entry.technologies,
    kronus_wisdom: entry.kronus_wisdom ?? null,
    raw_agent_report: entry.raw_agent_report,
    files_changed: entry.files_changed
      ? JSON.stringify(entry.files_changed)
      : null,
    summary: entry.summary ?? null,
  };

  const insertStmt = db.prepare(`
    INSERT INTO journal_entries (
      commit_hash, repository, branch, author, date, why, what_changed,
      decisions, technologies, kronus_wisdom, raw_agent_report, files_changed, summary
    ) VALUES (
      @commit_hash, @repository, @branch, @author, @date, @why, @what_changed,
      @decisions, @technologies, @kronus_wisdom, @raw_agent_report, @files_changed, @summary
    );
  `);

  try {
    const result = insertStmt.run(params);
    logger.success(
      `Created journal entry for ${entry.repository}/${entry.branch} (${entry.commit_hash})`,
    );
    return Number(result.lastInsertRowid);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code == "SQLITE_CONSTRAINT"
    ) {
      throw new Error(
        `Entry already exists for commit ${entry.commit_hash}. Each commit can only have one journal entry.`,
      );
    }
    throw error;
  }
};

export const getEntriesByRepositoryPaginated = (
  repository: string,
  limit: number = 50,
  offset: number = 0,
): { entries: JournalEntry[]; total: number } => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const repo = normalizeRepository(repository);
  const rows = db
    .prepare(
      `
    SELECT * FROM journal_entries
    WHERE repository = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(repo, limit, offset);

  const totalRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM journal_entries WHERE repository = ?",
    )
    .get(repo) as { count: number };

  return {
    entries: rows.map(mapRow),
    total: totalRow.count,
  };
};

export const getEntriesByBranchPaginated = (
  repository: string,
  branch: string,
  limit: number = 50,
  offset: number = 0,
): { entries: JournalEntry[]; total: number } => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const repo = normalizeRepository(repository);
  const rows = db
    .prepare(
      `
    SELECT * FROM journal_entries
    WHERE repository = ? AND branch = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(repo, branch, limit, offset);

  const totalRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM journal_entries WHERE repository = ? AND branch = ?",
    )
    .get(repo, branch) as { count: number };

  return {
    entries: rows.map(mapRow),
    total: totalRow.count,
  };
};

export const getEntryByCommit = (commitHash: string): JournalEntry | null => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const row = db
    .prepare(
      `
    SELECT * FROM journal_entries
    WHERE commit_hash = ?
    LIMIT 1
  `,
    )
    .get(commitHash);
  return row ? mapRow(row) : null;
};

export const listRepositories = (): string[] => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  // Include repositories from both journal entries and project summaries
  // This ensures repositories with project summaries but no entries yet are still listed
  const entryRows = db
    .prepare(
      `
    SELECT DISTINCT repository FROM journal_entries
  `,
    )
    .all() as Array<{ repository: string }>;

  const summaryRows = db
    .prepare(
      `
    SELECT DISTINCT repository FROM repository_overviews
  `,
    )
    .all() as Array<{ repository: string }>;

  // Combine and deduplicate
  const allRepos = new Set<string>();
  entryRows.forEach((row) => allRepos.add(row.repository));
  summaryRows.forEach((row) => allRepos.add(row.repository));

  return Array.from(allRepos).sort();
};

export const listBranches = (repository: string): string[] => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const rows = db
    .prepare(
      `
    SELECT DISTINCT branch FROM journal_entries
    WHERE repository = ?
    ORDER BY branch ASC
  `,
    )
    .all(normalizeRepository(repository));
  return rows.map((row: any) => row.branch as string);
};

/**
 * Get journal entry statistics for a repository
 * Returns count and date of last entry
 */
export const getRepositoryEntryStats = (
  repository: string,
): { count: number; lastEntryDate: string | null } => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const repo = normalizeRepository(repository);
  const countRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM journal_entries WHERE repository = ?",
    )
    .get(repo) as { count: number };

  const lastEntryRow = db
    .prepare(
      `
      SELECT date FROM journal_entries
      WHERE repository = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    )
    .get(repo) as { date: string } | undefined;

  return {
    count: countRow.count,
    lastEntryDate: lastEntryRow?.date || null,
  };
};

export const closeDatabase = () => {
  if (db) {
    db.close();
    db = null;
    logger.info("Journal database closed");
  }
};

/**
 * Helper function to check if entry exists for a commit
 */
export const commitHasEntry = (commitHash: string): boolean => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const row = db
    .prepare("SELECT 1 FROM journal_entries WHERE commit_hash = ? LIMIT 1")
    .get(commitHash);
  return row !== undefined;
};

/**
 * Update an existing journal entry
 */
export const updateJournalEntry = (
  commitHash: string,
  updates: Partial<Omit<JournalEntryInsert, "commit_hash">>,
): void => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const fields: string[] = [];
  const params: Record<string, any> = { commit_hash: commitHash };

  if (updates.why !== undefined) {
    fields.push("why = @why");
    params.why = updates.why;
  }
  if (updates.what_changed !== undefined) {
    fields.push("what_changed = @what_changed");
    params.what_changed = updates.what_changed;
  }
  if (updates.decisions !== undefined) {
    fields.push("decisions = @decisions");
    params.decisions = updates.decisions;
  }
  if (updates.technologies !== undefined) {
    fields.push("technologies = @technologies");
    params.technologies = updates.technologies;
  }
  if (updates.kronus_wisdom !== undefined) {
    fields.push("kronus_wisdom = @kronus_wisdom");
    params.kronus_wisdom = updates.kronus_wisdom;
  }

  if (fields.length === 0) {
    throw new Error("No fields to update");
  }

  const updateStmt = db.prepare(`
    UPDATE journal_entries
    SET ${fields.join(", ")}
    WHERE commit_hash = @commit_hash
  `);

  const result = updateStmt.run(params);

  if (result.changes === 0) {
    throw new Error(`No entry found for commit ${commitHash}`);
  }

  logger.success(`Updated journal entry for commit ${commitHash}`);
};

/**
 * Update repository name for entries (useful for fixing misnamed repositories)
 */
/**
 * Project Summary CRUD operations
 */
const mapProjectSummaryRow = (row: any): ProjectSummary => {
  const summary: ProjectSummary = {
    id: row.id,
    repository: row.repository,
    git_url: row.git_url,
    summary: row.summary,
    purpose: row.purpose,
    architecture: row.architecture,
    key_decisions: row.key_decisions,
    technologies: row.technologies,
    status: row.status,
    updated_at: row.updated_at,
    linear_project_id: row.linear_project_id || null,
    linear_issue_id: row.linear_issue_id || null,
    // Living Project Summary (Entry 0) - Enhanced fields
    file_structure: row.file_structure || null,
    tech_stack: row.tech_stack || null,
    frontend: row.frontend || null,
    backend: row.backend || null,
    database_info: row.database_info || null,
    services: row.services || null,
    custom_tooling: row.custom_tooling || null,
    data_flow: row.data_flow || null,
    patterns: row.patterns || null,
    commands: row.commands || null,
    extended_notes: row.extended_notes || null,
    last_synced_entry: row.last_synced_entry || null,
    entries_synced: row.entries_synced || null,
  };

  // Add journal entry stats for this repository
  try {
    const stats = getRepositoryEntryStats(row.repository);
    summary.entry_count = stats.count;
    summary.last_entry_date = stats.lastEntryDate;
  } catch (error) {
    // If stats can't be retrieved, leave them undefined
    summary.entry_count = 0;
    summary.last_entry_date = null;
  }

  return summary;
};

export const upsertProjectSummary = (summary: ProjectSummaryInsert): number => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const params = {
    repository: normalizeRepository(summary.repository),
    git_url: summary.git_url,
    summary: summary.summary,
    purpose: summary.purpose,
    architecture: summary.architecture,
    key_decisions: summary.key_decisions,
    technologies: summary.technologies,
    status: summary.status,
    linear_project_id: summary.linear_project_id || null,
    linear_issue_id: summary.linear_issue_id || null,
    // Living Project Summary (Entry 0) - Enhanced fields
    file_structure: summary.file_structure || null,
    tech_stack: summary.tech_stack || null,
    frontend: summary.frontend || null,
    backend: summary.backend || null,
    database_info: summary.database_info || null,
    services: summary.services || null,
    custom_tooling: summary.custom_tooling || null,
    data_flow: summary.data_flow || null,
    patterns: summary.patterns || null,
    commands: summary.commands || null,
    extended_notes: summary.extended_notes || null,
    last_synced_entry: summary.last_synced_entry || null,
    entries_synced: summary.entries_synced || null,
  };

  const upsertStmt = db.prepare(`
    INSERT INTO repository_overviews (
      repository, git_url, summary, purpose, architecture, key_decisions, technologies, status,
      linear_project_id, linear_issue_id,
      file_structure, tech_stack, frontend, backend, database_info, services,
      custom_tooling, data_flow, patterns, commands, extended_notes,
      last_synced_entry, entries_synced
    ) VALUES (
      @repository, @git_url, @summary, @purpose, @architecture, @key_decisions, @technologies, @status,
      @linear_project_id, @linear_issue_id,
      @file_structure, @tech_stack, @frontend, @backend, @database_info, @services,
      @custom_tooling, @data_flow, @patterns, @commands, @extended_notes,
      @last_synced_entry, @entries_synced
    )
    ON CONFLICT(repository) DO UPDATE SET
      git_url = @git_url,
      summary = @summary,
      purpose = @purpose,
      architecture = @architecture,
      key_decisions = @key_decisions,
      technologies = @technologies,
      status = @status,
      linear_project_id = @linear_project_id,
      linear_issue_id = @linear_issue_id,
      file_structure = COALESCE(@file_structure, file_structure),
      tech_stack = COALESCE(@tech_stack, tech_stack),
      frontend = COALESCE(@frontend, frontend),
      backend = COALESCE(@backend, backend),
      database_info = COALESCE(@database_info, database_info),
      services = COALESCE(@services, services),
      custom_tooling = COALESCE(@custom_tooling, custom_tooling),
      data_flow = COALESCE(@data_flow, data_flow),
      patterns = COALESCE(@patterns, patterns),
      commands = COALESCE(@commands, commands),
      extended_notes = COALESCE(@extended_notes, extended_notes),
      last_synced_entry = COALESCE(@last_synced_entry, last_synced_entry),
      entries_synced = COALESCE(@entries_synced, entries_synced),
      updated_at = CURRENT_TIMESTAMP
  `);

  const result = upsertStmt.run(params);
  logger.success(`Upserted project summary for ${summary.repository}`);
  return Number(result.lastInsertRowid);
};

export const getProjectSummary = (
  repository: string,
): ProjectSummary | null => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const row = db
    .prepare("SELECT * FROM repository_overviews WHERE repository = ? LIMIT 1")
    .get(normalizeRepository(repository));
  return row ? mapProjectSummaryRow(row) : null;
};

export const listAllProjectSummariesPaginated = (
  limit: number = 50,
  offset: number = 0,
): { summaries: ProjectSummary[]; total: number } => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const rows = db
    .prepare(
      "SELECT * FROM repository_overviews ORDER BY repository ASC LIMIT ? OFFSET ?",
    )
    .all(limit, offset);

  const totalRow = db
    .prepare("SELECT COUNT(*) as count FROM repository_overviews")
    .get() as { count: number };

  return {
    summaries: rows.map(mapProjectSummaryRow),
    total: totalRow.count,
  };
};

// ============================================
// Entry 0 v2 — Structured Sections with History
// ============================================

/**
 * Map a DB row to ProjectSummaryV2 (includes sections_json + legacy columns)
 */
const mapProjectSummaryV2Row = (row: any): ProjectSummaryV2 => {
  const base = mapProjectSummaryRow(row);
  return {
    ...base,
    schema_version: row.schema_version ?? 1,
    sections_json: row.sections_json ? JSON.parse(row.sections_json) : null,
    last_scanned_commit: row.last_scanned_commit ?? null,
    total_updates: row.total_updates ?? 0,
  };
};

/**
 * Get project summary as v2 (with sections_json parsed)
 */
export const getProjectSummaryV2 = (
  repository: string,
): ProjectSummaryV2 | null => {
  if (!db) throw new Error("Database not initialized");
  const row = db
    .prepare("SELECT * FROM repository_overviews WHERE repository = ? LIMIT 1")
    .get(normalizeRepository(repository));
  return row ? mapProjectSummaryV2Row(row) : null;
};

/**
 * Create a new section with history tracking
 */
function createSection(
  value: string,
  commit: string,
  date: string,
): SectionWithHistory {
  return {
    current: value,
    last_updated: date,
    last_commit: commit,
    history: [],
  };
}

/**
 * Update a section, pushing the old value to history
 */
function updateSection(
  existing: SectionWithHistory | undefined,
  newValue: string,
  commit: string,
  date: string,
  changeSummary: string,
): SectionWithHistory {
  if (!existing) {
    return createSection(newValue, commit, date);
  }

  // Don't push to history if value hasn't changed
  if (existing.current.trim() === newValue.trim()) {
    return existing;
  }

  return {
    current: newValue,
    last_updated: date,
    last_commit: commit,
    history: [
      {
        date: existing.last_updated,
        commit: existing.last_commit,
        change_summary: changeSummary,
        previous_value: existing.current,
      },
      ...existing.history,
    ],
  };
}

/**
 * Create Entry 0 v2 — agent fills exhaustive schema, we persist as sections_json
 */
export const createProjectSummaryV2 = (params: {
  repository: string;
  git_url?: string | null;
  current_commit: string;
  sections: Record<string, string>; // section_name → value
}): number => {
  if (!db) throw new Error("Database not initialized");

  const now = new Date().toISOString();

  // Build sections_json from provided sections
  const sectionsJson: SectionsJson = {};
  for (const [key, value] of Object.entries(params.sections)) {
    if (value && value.trim().length > 0) {
      sectionsJson[key as AllSection] = createSection(
        value,
        params.current_commit,
        now,
      );
    }
  }

  // Also write to legacy flat columns for backward compatibility
  const legacyParams: Record<string, any> = {
    repository: normalizeRepository(params.repository),
    git_url: params.git_url || null,
    schema_version: CURRENT_SCHEMA_VERSION,
    sections_json: JSON.stringify(sectionsJson),
    last_scanned_commit: params.current_commit,
    total_updates: 0,
  };

  // Map sections to legacy columns where they exist
  const legacyColumnMap: Record<string, string> = {
    summary: "summary",
    purpose: "purpose",
    architecture: "architecture",
    key_decisions: "key_decisions",
    technologies: "technologies",
    status: "status",
    file_structure: "file_structure",
    tech_stack: "tech_stack",
    frontend: "frontend",
    backend: "backend",
    database_info: "database_info",
    services: "services",
    custom_tooling: "custom_tooling",
    data_flow: "data_flow",
    patterns: "patterns",
    commands: "commands",
    extended_notes: "extended_notes",
  };

  for (const [section, column] of Object.entries(legacyColumnMap)) {
    legacyParams[column] = params.sections[section] || null;
  }

  const columns = Object.keys(legacyParams);
  const placeholders = columns.map((c) => `@${c}`).join(", ");
  const columnList = columns.join(", ");

  const stmt = db.prepare(
    `INSERT INTO repository_overviews (${columnList}) VALUES (${placeholders})`,
  );

  const result = stmt.run(legacyParams);
  logger.success(`Created Entry 0 v2 for ${params.repository}`);
  return Number(result.lastInsertRowid);
};

/**
 * Update technical sections of Entry 0 v2
 * Only touches technical sections, preserves narrative.
 */
export const updateProjectTechnicalV2 = (params: {
  repository: string;
  to_commit: string;
  sections: Record<string, string>; // section_name → new value (only changed sections)
  change_summary: string;
}): { updatedSections: string[]; totalUpdates: number } => {
  if (!db) throw new Error("Database not initialized");

  const repo = normalizeRepository(params.repository);
  const existing = getProjectSummaryV2(repo);
  if (!existing) throw new Error(`No Entry 0 found for "${repo}"`);

  const now = new Date().toISOString();
  const currentSections: SectionsJson = existing.sections_json || {};
  const updatedSections: string[] = [];

  // Update only provided sections
  for (const [key, value] of Object.entries(params.sections)) {
    if (value && value.trim().length > 0) {
      const sectionKey = key as AllSection;
      currentSections[sectionKey] = updateSection(
        currentSections[sectionKey],
        value,
        params.to_commit,
        now,
        params.change_summary,
      );
      updatedSections.push(key);
    }
  }

  const newTotalUpdates = (existing.total_updates || 0) + 1;

  // Update sections_json + legacy columns + metadata
  const updateParams: Record<string, any> = {
    sections_json: JSON.stringify(currentSections),
    last_scanned_commit: params.to_commit,
    total_updates: newTotalUpdates,
    schema_version: CURRENT_SCHEMA_VERSION,
    repository: repo,
  };

  // Also update legacy flat columns for backward compatibility
  for (const key of updatedSections) {
    if (params.sections[key]) {
      updateParams[key] = params.sections[key];
    }
  }

  const setClauses = Object.keys(updateParams)
    .filter((k) => k !== "repository")
    .map((k) => `${k} = @${k}`)
    .join(", ");

  db.prepare(
    `UPDATE repository_overviews SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE repository = @repository`,
  ).run(updateParams);

  logger.success(
    `Updated ${updatedSections.length} technical sections for ${params.repository}`,
  );

  return { updatedSections, totalUpdates: newTotalUpdates };
};

/**
 * Update narrative sections of Entry 0 v2
 * Only touches narrative sections, preserves technical.
 */
export const updateProjectNarrativeV2 = (params: {
  repository: string;
  sections: Record<string, string>; // section_name → new value
  commit?: string;
  change_summary: string;
}): { updatedSections: string[] } => {
  if (!db) throw new Error("Database not initialized");

  const repo = normalizeRepository(params.repository);
  const existing = getProjectSummaryV2(repo);
  if (!existing) throw new Error(`No Entry 0 found for "${repo}"`);

  const now = new Date().toISOString();
  const commit = params.commit || "narrative-update";
  const currentSections: SectionsJson = existing.sections_json || {};
  const updatedSections: string[] = [];

  for (const [key, value] of Object.entries(params.sections)) {
    if (value && value.trim().length > 0) {
      const sectionKey = key as AllSection;
      currentSections[sectionKey] = updateSection(
        currentSections[sectionKey],
        value,
        commit,
        now,
        params.change_summary,
      );
      updatedSections.push(key);
    }
  }

  // Update sections_json + legacy columns
  const updateParams: Record<string, any> = {
    sections_json: JSON.stringify(currentSections),
    schema_version: CURRENT_SCHEMA_VERSION,
    repository: repo,
  };

  for (const key of updatedSections) {
    if (params.sections[key]) {
      updateParams[key] = params.sections[key];
    }
  }

  const setClauses = Object.keys(updateParams)
    .filter((k) => k !== "repository")
    .map((k) => `${k} = @${k}`)
    .join(", ");

  db.prepare(
    `UPDATE repository_overviews SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE repository = @repository`,
  ).run(updateParams);

  logger.success(
    `Updated ${updatedSections.length} narrative sections for ${params.repository}`,
  );

  return { updatedSections };
};

/**
 * Get shallow view of Entry 0 — flat key:value, no history (for LLM context)
 */
export const getShallowView = (
  repository: string,
): Record<string, string> | null => {
  const summary = getProjectSummaryV2(repository);
  if (!summary || !summary.sections_json) return null;

  const shallow: Record<string, string> = {};
  for (const [key, section] of Object.entries(summary.sections_json)) {
    if (section && section.current && section.current.trim().length > 0) {
      shallow[key] = section.current;
    }
  }
  return shallow;
};

/**
 * Get deep view of Entry 0 — full sections with history (for Kronus/debugging)
 */
export const getDeepView = (
  repository: string,
): ProjectSummaryV2 | null => {
  return getProjectSummaryV2(repository);
};

/**
 * Attachment CRUD operations
 */

const mapAttachmentRow = (row: any): Attachment => ({
  id: row.id,
  commit_hash: row.commit_hash,
  filename: row.filename,
  mime_type: row.mime_type,
  description: row.description ?? null,
  data: row.data,
  file_size: row.file_size,
  uploaded_at: row.uploaded_at,
});

/**
 * Insert a new attachment for a journal entry
 */
export const insertAttachment = (attachment: AttachmentInsert): number => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  // Verify that the commit hash exists
  if (!commitHasEntry(attachment.commit_hash)) {
    throw new Error(
      `No journal entry found for commit ${attachment.commit_hash}. Create an entry first.`,
    );
  }

  const params = {
    commit_hash: attachment.commit_hash,
    filename: attachment.filename,
    mime_type: attachment.mime_type,
    description: attachment.description ?? null,
    data: attachment.data,
    file_size: attachment.file_size,
  };

  const insertStmt = db.prepare(`
    INSERT INTO entry_attachments (
      commit_hash, filename, mime_type, description, data, file_size
    ) VALUES (
      @commit_hash, @filename, @mime_type, @description, @data, @file_size
    );
  `);

  const result = insertStmt.run(params);
  logger.success(
    `Attached file "${attachment.filename}" (${attachment.file_size} bytes) to commit ${attachment.commit_hash}`,
  );
  return Number(result.lastInsertRowid);
};

/**
 * Get all attachments for a specific commit
 */
export const getAttachmentsByCommit = (commitHash: string): Attachment[] => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const rows = db
    .prepare(
      `
    SELECT * FROM entry_attachments
    WHERE commit_hash = ?
    ORDER BY uploaded_at ASC
  `,
    )
    .all(commitHash);
  return rows.map(mapAttachmentRow);
};

/**
 * Get attachment metadata only (without binary data) for a commit
 */
export const getAttachmentMetadataByCommit = (
  commitHash: string,
): Array<{
  id: number;
  commit_hash: string;
  filename: string;
  mime_type: string;
  description: string | null;
  file_size: number;
  uploaded_at: string;
}> => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const rows = db
    .prepare(
      `
    SELECT id, commit_hash, filename, mime_type, description, file_size, uploaded_at
    FROM entry_attachments
    WHERE commit_hash = ?
    ORDER BY uploaded_at ASC
  `,
    )
    .all(commitHash);
  return rows as Array<{
    id: number;
    commit_hash: string;
    filename: string;
    mime_type: string;
    description: string | null;
    file_size: number;
    uploaded_at: string;
  }>;
};

/**
 * Get a specific attachment by ID
 */
export const getAttachmentById = (id: number): Attachment | null => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const row = db
    .prepare(
      `
    SELECT * FROM entry_attachments
    WHERE id = ?
    LIMIT 1
  `,
    )
    .get(id);
  return row ? mapAttachmentRow(row) : null;
};

/**
 * Delete an attachment by ID
 */
/**
 * Get attachment count and total size for a commit
 */
export const getAttachmentStats = (
  commitHash: string,
): { count: number; total_size: number } => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  const row = db
    .prepare(
      `
    SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_size
    FROM entry_attachments
    WHERE commit_hash = ?
  `,
    )
    .get(commitHash) as any;
  return {
    count: row.count,
    total_size: row.total_size,
  };
};

/**
 * Get attachment counts for multiple commits (for batch operations)
 */
export const getAttachmentCountsForCommits = (
  commitHashes: string[],
): Map<string, number> => {
  if (!db) {
    throw new Error("Database not initialized");
  }
  if (commitHashes.length === 0) {
    return new Map();
  }

  // Create placeholders for IN clause
  const placeholders = commitHashes.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
    SELECT commit_hash, COUNT(*) as count
    FROM entry_attachments
    WHERE commit_hash IN (${placeholders})
    GROUP BY commit_hash
  `,
    )
    .all(...commitHashes) as Array<{ commit_hash: string; count: number }>;

  const result = new Map<string, number>();
  // Initialize all commits with 0
  commitHashes.forEach((hash) => result.set(hash, 0));
  // Update with actual counts
  rows.forEach((row) => result.set(row.commit_hash, row.count));

  return result;
};

/**
 * Update an attachment's description
 */
export const updateAttachmentDescription = (
  attachmentId: number,
  description: string | null,
): void => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const updateStmt = db.prepare(`
    UPDATE entry_attachments
    SET description = @description
    WHERE id = @id
  `);

  const result = updateStmt.run({ id: attachmentId, description });

  if (result.changes === 0) {
    throw new Error(`No attachment found with ID ${attachmentId}`);
  }

  logger.success(`Updated description for attachment ${attachmentId}`);
};

/**
 * Export all entries and project summaries as SQL INSERT statements
 */
export const exportToSQL = (outputPath: string): void => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const entries = db
    .prepare("SELECT * FROM journal_entries ORDER BY created_at ASC")
    .all() as JournalEntry[];
  const summaries = db
    .prepare("SELECT * FROM repository_overviews ORDER BY repository ASC")
    .all() as ProjectSummary[];

  // Get attachment metadata (not binary data) for the backup
  const attachmentMetadata = db
    .prepare(
      `
    SELECT id, commit_hash, filename, mime_type, description, file_size, uploaded_at
    FROM entry_attachments ORDER BY uploaded_at ASC
  `,
    )
    .all() as Array<{
    id: number;
    commit_hash: string;
    filename: string;
    mime_type: string;
    description: string | null;
    file_size: number;
    uploaded_at: string;
  }>;

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
      (summary as any).linear_project_id || null,
      (summary as any).linear_issue_id || null,
      summary.updated_at,
    ].map((v) => {
      if (v === null) return "NULL";
      if (typeof v === "string") {
        return `'${v.replace(/'/g, "''")}'`;
      }
      return String(v);
    });

    sql += `INSERT INTO repository_overviews (repository, git_url, summary, purpose, architecture, key_decisions, technologies, status, linear_project_id, linear_issue_id, updated_at) VALUES (${values.join(", ")});\n`;
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

  // Add attachment metadata (note: binary data is NOT included in SQL backup)
  sql += "\n-- Attachment Metadata (Binary data stored in database only)\n";
  for (const att of attachmentMetadata) {
    const desc = att.description ? ` - ${att.description}` : "";
    sql += `-- Attachment: ${att.filename} (${att.file_size} bytes, ${att.mime_type})${desc} for commit ${att.commit_hash}\n`;
  }

  fs.writeFileSync(outputPath, sql, "utf-8");
  logger.success(
    `Exported ${entries.length} entries, ${summaries.length} project summaries, and ${attachmentMetadata.length} attachment references to ${outputPath}`,
  );
};

/**
 * Unified Media Library - Query both entry_attachments and media_assets
 */
export interface MediaLibraryFilters {
  repository?: string;
  commit_hash?: string;
  destination?: "journal" | "repository" | "media" | "portfolio" | "all";
  mime_type_prefix?: string;
  tags?: string[];
}

export interface UnifiedMediaRow {
  source: "entry_attachments" | "media_assets";
  source_id: number;
  filename: string;
  mime_type: string;
  file_size: number;
  description: string | null;
  commit_hash: string | null;
  repository: string | null;
  document_id: number | null;
  destination: string | null;
  alt: string | null;
  prompt: string | null;
  model: string | null;
  tags: string | null;
  width: number | null;
  height: number | null;
  drive_url: string | null;
  supabase_url: string | null;
  created_at: string;
}

export const getUnifiedMediaLibrary = (
  filters: MediaLibraryFilters,
  limit: number = 50,
  offset: number = 0,
): {
  items: UnifiedMediaRow[];
  total: number;
  sources: { entry_attachments: number; media_assets: number };
} => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  // Clamp limit
  const safeLimit = Math.min(Math.max(1, limit), 100);

  // Build WHERE clauses
  const attachmentConditions: string[] = ["1=1"];
  const mediaConditions: string[] = ["1=1"];
  const params: any[] = [];

  if (filters.commit_hash) {
    attachmentConditions.push("ea.commit_hash = ?");
    mediaConditions.push("ma.commit_hash = ?");
    params.push(filters.commit_hash, filters.commit_hash);
  }

  if (filters.repository) {
    // For attachments, join with journal_entries to get repository
    attachmentConditions.push("je.repository = ?");
    // For media_assets, need to join with journal_entries if commit_hash present
    mediaConditions.push("(je2.repository = ? OR ma.commit_hash IS NULL)");
    params.push(filters.repository, filters.repository);
  }

  if (filters.mime_type_prefix) {
    attachmentConditions.push("ea.mime_type LIKE ?");
    mediaConditions.push("ma.mime_type LIKE ?");
    const prefix = filters.mime_type_prefix + "%";
    params.push(prefix, prefix);
  }

  if (filters.destination && filters.destination !== "all") {
    // Only applies to media_assets
    mediaConditions.push("ma.destination = ?");
    params.push(filters.destination);
  }

  // Get counts for each source
  const attachmentCountQuery = `
    SELECT COUNT(*) as count
    FROM entry_attachments ea
    LEFT JOIN journal_entries je ON ea.commit_hash = je.commit_hash
    WHERE ${attachmentConditions.join(" AND ")}
  `;

  const mediaCountQuery = `
    SELECT COUNT(*) as count
    FROM media_assets ma
    LEFT JOIN journal_entries je2 ON ma.commit_hash = je2.commit_hash
    WHERE ${mediaConditions.join(" AND ")}
  `;

  // Note: params order matters - attachment conditions first, then media conditions
  const attachmentParams = params.filter(
    (_, i) =>
      i % 2 === 0 ||
      (!filters.commit_hash &&
        !filters.repository &&
        !filters.mime_type_prefix),
  );
  const mediaParams = params.filter(
    (_, i) =>
      i % 2 === 1 ||
      (!filters.commit_hash &&
        !filters.repository &&
        !filters.mime_type_prefix),
  );

  // Simplified approach: build params for each query separately
  const buildParams = (forMedia: boolean): any[] => {
    const p: any[] = [];
    if (filters.commit_hash) p.push(filters.commit_hash);
    if (filters.repository) p.push(filters.repository);
    if (filters.mime_type_prefix) p.push(filters.mime_type_prefix + "%");
    if (forMedia && filters.destination && filters.destination !== "all") {
      p.push(filters.destination);
    }
    return p;
  };

  const attachmentCount = (
    db.prepare(attachmentCountQuery).get(...buildParams(false)) as {
      count: number;
    }
  ).count;
  const mediaCount = (
    db.prepare(mediaCountQuery).get(...buildParams(true)) as { count: number }
  ).count;

  // UNION query for actual data
  const query = `
    SELECT
      'entry_attachments' as source,
      ea.id as source_id,
      ea.filename,
      ea.mime_type,
      ea.file_size,
      ea.description,
      ea.commit_hash,
      je.repository,
      NULL as document_id,
      'journal' as destination,
      NULL as alt,
      NULL as prompt,
      NULL as model,
      NULL as tags,
      NULL as width,
      NULL as height,
      NULL as drive_url,
      NULL as supabase_url,
      ea.uploaded_at as created_at
    FROM entry_attachments ea
    LEFT JOIN journal_entries je ON ea.commit_hash = je.commit_hash
    WHERE ${attachmentConditions.join(" AND ")}

    UNION ALL

    SELECT
      'media_assets' as source,
      ma.id as source_id,
      ma.filename,
      ma.mime_type,
      ma.file_size,
      ma.description,
      ma.commit_hash,
      je2.repository,
      ma.document_id,
      ma.destination,
      ma.alt,
      ma.prompt,
      ma.model,
      ma.tags,
      ma.width,
      ma.height,
      ma.drive_url,
      ma.supabase_url,
      ma.created_at
    FROM media_assets ma
    LEFT JOIN journal_entries je2 ON ma.commit_hash = je2.commit_hash
    WHERE ${mediaConditions.join(" AND ")}

    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  const allParams = [
    ...buildParams(false),
    ...buildParams(true),
    safeLimit,
    offset,
  ];
  const items = db.prepare(query).all(...allParams) as UnifiedMediaRow[];

  return {
    items,
    total: attachmentCount + mediaCount,
    sources: {
      entry_attachments: attachmentCount,
      media_assets: mediaCount,
    },
  };
};

// ============================================
// Linear Cache - Read Operations
// These functions read from the locally cached Linear data
// (synced from Linear API via Tartarus web app)
// ============================================

export interface LinearProject {
  id: string;
  name: string;
  description: string | null;
  content: string | null;
  state: string | null;
  progress: number | null;
  target_date: string | null;
  start_date: string | null;
  url: string;
  lead_id: string | null;
  lead_name: string | null;
  team_ids: string[];
  member_ids: string[];
  synced_at: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  summary: string | null;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  priority: number | null;
  state_id: string | null;
  state_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  team_id: string | null;
  team_name: string | null;
  team_key: string | null;
  project_id: string | null;
  project_name: string | null;
  parent_id: string | null;
  synced_at: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  summary: string | null;
}

const mapLinearProjectRow = (row: any): LinearProject => ({
  id: row.id,
  name: row.name,
  description: row.description,
  content: row.content,
  state: row.state,
  progress: row.progress,
  target_date: row.target_date,
  start_date: row.start_date,
  url: row.url,
  lead_id: row.lead_id,
  lead_name: row.lead_name,
  team_ids: row.team_ids ? JSON.parse(row.team_ids) : [],
  member_ids: row.member_ids ? JSON.parse(row.member_ids) : [],
  synced_at: row.synced_at,
  is_deleted: row.is_deleted === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
  summary: row.summary,
});

const mapLinearIssueRow = (row: any): LinearIssue => ({
  id: row.id,
  identifier: row.identifier,
  title: row.title,
  description: row.description,
  url: row.url,
  priority: row.priority,
  state_id: row.state_id,
  state_name: row.state_name,
  assignee_id: row.assignee_id,
  assignee_name: row.assignee_name,
  team_id: row.team_id,
  team_name: row.team_name,
  team_key: row.team_key,
  project_id: row.project_id,
  project_name: row.project_name,
  parent_id: row.parent_id,
  synced_at: row.synced_at,
  is_deleted: row.is_deleted === 1,
  created_at: row.created_at,
  updated_at: row.updated_at,
  summary: row.summary,
});

/**
 * List cached Linear projects - HISTORICAL BUFFER
 *
 * By default shows ALL projects (including deleted) to preserve historical context.
 * Linear cache is a BUFFER - we keep everything for rich context and history.
 * Even if Linear deletes a project, our cache preserves it with is_deleted=true.
 *
 * Set includeDeleted=false to filter out deleted projects.
 */
export const listLinearProjects = (
  options: {
    includeDeleted?: boolean;
    state?: string;
    limit?: number;
    offset?: number;
  } = {},
): { projects: LinearProject[]; total: number } => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const { includeDeleted = true, state, limit = 50, offset = 0 } = options;

  const conditions: string[] = [];
  const params: any[] = [];

  if (!includeDeleted) {
    conditions.push("is_deleted = 0");
  }
  if (state) {
    conditions.push("state = ?");
    params.push(state);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
    SELECT * FROM linear_projects
    ${whereClause}
    ORDER BY is_deleted ASC, name ASC
    LIMIT ? OFFSET ?
  `,
    )
    .all(...params, limit, offset);

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM linear_projects ${whereClause}`)
    .get(...params) as { count: number };

  return {
    projects: rows.map(mapLinearProjectRow),
    total: totalRow.count,
  };
};

/**
 * Get a specific Linear project by ID
 */
export const getLinearProject = (id: string): LinearProject | null => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const row = db.prepare("SELECT * FROM linear_projects WHERE id = ?").get(id);
  return row ? mapLinearProjectRow(row) : null;
};

/**
 * List cached Linear issues - HISTORICAL BUFFER
 *
 * By default shows ALL issues (including deleted) to preserve historical context.
 * Linear cache is a BUFFER - we keep everything for rich context and history.
 * Even if Linear deletes an issue, our cache preserves it with is_deleted=true.
 *
 * Rich descriptions and context are preserved forever - great material for AI context.
 */
export const listLinearIssues = (
  options: {
    projectId?: string;
    assigneeId?: string;
    stateName?: string;
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): { issues: LinearIssue[]; total: number } => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const {
    projectId,
    assigneeId,
    stateName,
    includeDeleted = true,
    limit = 50,
    offset = 0,
  } = options;

  const conditions: string[] = [];
  const params: any[] = [];

  if (!includeDeleted) {
    conditions.push("is_deleted = 0");
  }
  if (projectId) {
    conditions.push("project_id = ?");
    params.push(projectId);
  }
  if (assigneeId) {
    conditions.push("assignee_id = ?");
    params.push(assigneeId);
  }
  if (stateName) {
    conditions.push("state_name = ?");
    params.push(stateName);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
    SELECT * FROM linear_issues
    ${whereClause}
    ORDER BY is_deleted ASC, identifier DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(...params, limit, offset);

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM linear_issues ${whereClause}`)
    .get(...params) as { count: number };

  return {
    issues: rows.map(mapLinearIssueRow),
    total: totalRow.count,
  };
};

/**
 * Get a specific Linear issue by ID or identifier (e.g., "DEV-123")
 */
export const getLinearIssue = (idOrIdentifier: string): LinearIssue | null => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  // Try by ID first, then by identifier
  let row = db
    .prepare("SELECT * FROM linear_issues WHERE id = ?")
    .get(idOrIdentifier);
  if (!row) {
    row = db
      .prepare("SELECT * FROM linear_issues WHERE identifier = ?")
      .get(idOrIdentifier);
  }
  return row ? mapLinearIssueRow(row) : null;
};

/**
 * Get Linear cache sync status - shows both active and archived counts
 *
 * The cache is a HISTORICAL BUFFER - we track everything including deleted items.
 */
export const getLinearCacheStats = (): {
  projects: { active: number; deleted: number; total: number };
  issues: { active: number; deleted: number; total: number };
  lastProjectSync: string | null;
  lastIssueSync: string | null;
} => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const projectStats = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deleted,
      MAX(synced_at) as last_sync
    FROM linear_projects
  `,
    )
    .get() as {
    total: number;
    active: number;
    deleted: number;
    last_sync: string | null;
  };

  const issueStats = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deleted,
      MAX(synced_at) as last_sync
    FROM linear_issues
  `,
    )
    .get() as {
    total: number;
    active: number;
    deleted: number;
    last_sync: string | null;
  };

  return {
    projects: {
      active: projectStats.active || 0,
      deleted: projectStats.deleted || 0,
      total: projectStats.total || 0,
    },
    issues: {
      active: issueStats.active || 0,
      deleted: issueStats.deleted || 0,
      total: issueStats.total || 0,
    },
    lastProjectSync: projectStats.last_sync,
    lastIssueSync: issueStats.last_sync,
  };
};

// ============================================
// LINEAR PROJECT UPDATES
// ============================================

export interface LinearProjectUpdate {
  id: string;
  projectId: string;
  projectName: string | null;
  body: string;
  health: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
  updatedAt: string;
}

const mapProjectUpdateRow = (row: any): LinearProjectUpdate => ({
  id: row.id,
  projectId: row.project_id,
  projectName: row.project_name,
  body: row.body,
  health: row.health,
  userId: row.user_id,
  userName: row.user_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * List project updates for a specific project (newest first)
 */
export const listLinearProjectUpdates = (
  projectId: string,
  limit: number = 10,
): LinearProjectUpdate[] => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const rows = db
    .prepare(
      `SELECT * FROM linear_project_updates
       WHERE project_id = ? AND is_deleted = 0
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(projectId, limit);

  return rows.map(mapProjectUpdateRow);
};

/**
 * List all recent project updates across all projects (newest first)
 */
export const listAllLinearProjectUpdates = (
  limit: number = 20,
): LinearProjectUpdate[] => {
  if (!db) {
    throw new Error("Database not initialized");
  }

  const rows = db
    .prepare(
      `SELECT * FROM linear_project_updates
       WHERE is_deleted = 0
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit);

  return rows.map(mapProjectUpdateRow);
};

// ============================================
// KRONUS CONTEXT - Direct DB queries for repository data
// Replaces HTTP calls to Tartarus for the same data
// ============================================

export interface DocumentRow {
  id: number;
  slug: string;
  type: string;
  title: string;
  content: string;
  language: string | null;
  summary: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

export const listDocuments = (limit: number = 50): DocumentRow[] => {
  if (!db) throw new Error("Database not initialized");
  return db
    .prepare(
      `SELECT id, slug, type, title, content, language, summary, metadata,
              created_at, updated_at
       FROM documents ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit)
    .map((row: any) => ({
      id: row.id,
      slug: row.slug,
      type: row.type,
      title: row.title,
      content: row.content,
      language: row.language,
      summary: row.summary,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
};

export const getDocumentBySlug = (slug: string): DocumentRow | null => {
  if (!db) throw new Error("Database not initialized");
  const row = db
    .prepare(`SELECT id, slug, type, title, content, language, summary, metadata,
              created_at, updated_at FROM documents WHERE slug = ?`)
    .get(slug) as any;
  if (!row) return null;
  return {
    id: row.id, slug: row.slug, type: row.type, title: row.title,
    content: row.content, language: row.language, summary: row.summary,
    metadata: row.metadata, createdAt: row.created_at, updatedAt: row.updated_at,
  };
};

export interface SkillRow {
  id: string;
  name: string;
  category: string;
  magnitude: number;
  description: string;
  summary: string | null;
}

export const listSkills = (): SkillRow[] => {
  if (!db) throw new Error("Database not initialized");
  return db
    .prepare(
      `SELECT id, name, category, magnitude, description, summary
       FROM skills ORDER BY category, magnitude DESC`,
    )
    .all() as SkillRow[];
};

export interface WorkExperienceRow {
  id: string;
  title: string;
  company: string;
  location: string;
  dateStart: string;
  dateEnd: string | null;
  tagline: string;
  achievements: string;
  summary: string | null;
}

export const listWorkExperience = (): WorkExperienceRow[] => {
  if (!db) throw new Error("Database not initialized");
  return db
    .prepare(
      `SELECT id, title, company, location, dateStart, dateEnd,
              tagline, achievements, summary
       FROM work_experience ORDER BY dateStart DESC`,
    )
    .all() as WorkExperienceRow[];
};

export interface EducationRow {
  id: string;
  degree: string;
  field: string;
  institution: string;
  dateStart: string;
  dateEnd: string;
  tagline: string;
  focusAreas: string;
  summary: string | null;
}

export const listEducation = (): EducationRow[] => {
  if (!db) throw new Error("Database not initialized");
  return db
    .prepare(
      `SELECT id, degree, field, institution, dateStart, dateEnd,
              tagline, focusAreas, summary
       FROM education ORDER BY dateStart DESC`,
    )
    .all() as EducationRow[];
};

export interface PortfolioProjectRow {
  id: string;
  title: string;
  category: string;
  company: string | null;
  status: string;
  featured: number;
  description: string | null;
  excerpt: string | null;
  role: string | null;
  technologies: string;
  metrics: string;
  summary: string | null;
}

export const listPortfolioProjects = (): PortfolioProjectRow[] => {
  if (!db) throw new Error("Database not initialized");
  return db
    .prepare(
      `SELECT id, title, category, company, status, featured,
              description, excerpt, role, technologies, metrics, summary
       FROM portfolio_projects ORDER BY featured DESC, sort_order`,
    )
    .all() as PortfolioProjectRow[];
};

export interface ConversationSummaryRow {
  id: number;
  title: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export const listConversationsWithSummaries = (
  limit: number = 50,
): ConversationSummaryRow[] => {
  if (!db) throw new Error("Database not initialized");
  return db
    .prepare(
      `SELECT id, title, summary, created_at, updated_at,
              json_array_length(messages) as messageCount
       FROM chat_conversations
       WHERE summary IS NOT NULL AND summary != ''
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit)
    .map((row: any) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.messageCount || 0,
    }));
};

// ============================================
// Slite Cache - Read Operations
// ============================================

export interface SliteNote {
  id: string;
  title: string;
  content: string | null;
  parent_note_id: string | null;
  url: string | null;
  owner_id: string | null;
  owner_name: string | null;
  review_state: string | null;
  note_type: string | null;
  summary: string | null;
  synced_at: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  last_edited_at: string | null;
}

const mapSliteNoteRow = (row: any): SliteNote => ({
  id: row.id,
  title: row.title,
  content: row.content,
  parent_note_id: row.parent_note_id,
  url: row.url,
  owner_id: row.owner_id,
  owner_name: row.owner_name,
  review_state: row.review_state,
  note_type: row.note_type,
  summary: row.summary,
  synced_at: row.synced_at,
  is_deleted: Boolean(row.is_deleted),
  created_at: row.created_at,
  updated_at: row.updated_at,
  last_edited_at: row.last_edited_at,
});

export const listSliteNotes = (options?: {
  includeDeleted?: boolean;
}): SliteNote[] => {
  if (!db) throw new Error("Database not initialized");

  const includeDeleted = options?.includeDeleted ?? false;
  const whereClause = includeDeleted ? "" : "WHERE is_deleted = 0";

  return db
    .prepare(
      `SELECT * FROM slite_notes ${whereClause} ORDER BY last_edited_at DESC, updated_at DESC`,
    )
    .all()
    .map(mapSliteNoteRow);
};

export const getSliteNote = (id: string): SliteNote | null => {
  if (!db) throw new Error("Database not initialized");

  const row = db
    .prepare("SELECT * FROM slite_notes WHERE id = ?")
    .get(id) as any;

  return row ? mapSliteNoteRow(row) : null;
};

export const getSliteCacheStats = (): {
  notes: { active: number; deleted: number; total: number };
  lastSync: string | null;
} => {
  if (!db) throw new Error("Database not initialized");

  const stats = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deleted,
      MAX(synced_at) as last_sync
    FROM slite_notes
  `,
    )
    .get() as {
    total: number;
    active: number;
    deleted: number;
    last_sync: string | null;
  };

  return {
    notes: {
      active: stats.active || 0,
      deleted: stats.deleted || 0,
      total: stats.total || 0,
    },
    lastSync: stats.last_sync,
  };
};

// ============================================
// Notion Cache - Read Operations
// ============================================

export interface NotionPage {
  id: string;
  title: string;
  content: string | null;
  parent_id: string | null;
  parent_type: string | null;
  url: string | null;
  created_by: string | null;
  created_by_name: string | null;
  last_edited_by: string | null;
  last_edited_by_name: string | null;
  icon: string | null;
  archived: boolean;
  summary: string | null;
  synced_at: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  last_edited_at: string | null;
}

const mapNotionPageRow = (row: any): NotionPage => ({
  id: row.id,
  title: row.title,
  content: row.content,
  parent_id: row.parent_id,
  parent_type: row.parent_type,
  url: row.url,
  created_by: row.created_by,
  created_by_name: row.created_by_name,
  last_edited_by: row.last_edited_by,
  last_edited_by_name: row.last_edited_by_name,
  icon: row.icon,
  archived: Boolean(row.archived),
  summary: row.summary,
  synced_at: row.synced_at,
  is_deleted: Boolean(row.is_deleted),
  created_at: row.created_at,
  updated_at: row.updated_at,
  last_edited_at: row.last_edited_at,
});

export const listNotionPages = (options?: {
  includeDeleted?: boolean;
}): NotionPage[] => {
  if (!db) throw new Error("Database not initialized");

  const includeDeleted = options?.includeDeleted ?? false;

  return db
    .prepare(
      `SELECT * FROM notion_pages ${includeDeleted ? "" : "WHERE is_deleted = 0"} ORDER BY last_edited_at DESC`,
    )
    .all()
    .map(mapNotionPageRow);
};

export const getNotionPage = (id: string): NotionPage | null => {
  if (!db) throw new Error("Database not initialized");

  const row = db
    .prepare("SELECT * FROM notion_pages WHERE id = ?")
    .get(id) as any;

  return row ? mapNotionPageRow(row) : null;
};

export const getNotionCacheStats = (): {
  pages: { active: number; deleted: number; total: number };
  lastSync: string | null;
} => {
  if (!db) throw new Error("Database not initialized");

  const stats = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deleted,
      MAX(synced_at) as last_sync
    FROM notion_pages
  `,
    )
    .get() as {
    total: number;
    active: number;
    deleted: number;
    last_sync: string | null;
  };

  return {
    pages: {
      active: stats.active || 0,
      deleted: stats.deleted || 0,
      total: stats.total || 0,
    },
    lastSync: stats.last_sync,
  };
};

// ============================================================================
// TARTARUS OBJECT REGISTRY — Read functions (MCP side)
// ============================================================================

export interface TartarusObject {
  uuid: string;
  type: string;
  source_table: string;
  source_id: string;
  title: string | null;
  summary: string | null;
  tags: string[];
  importance: number;
  estimated_tokens: number;
  created_at: string;
  updated_at: string;
}

function mapObjectRow(row: any): TartarusObject {
  return {
    ...row,
    tags: JSON.parse(row.tags || "[]"),
  };
}

export const getObjectByUUID = (uuid: string): TartarusObject | null => {
  if (!db) throw new Error("Database not initialized");
  const row = db
    .prepare("SELECT * FROM tartarus_objects WHERE uuid = ?")
    .get(uuid);
  return row ? mapObjectRow(row) : null;
};

export const getObjectBySource = (
  sourceTable: string,
  sourceId: string,
): TartarusObject | null => {
  if (!db) throw new Error("Database not initialized");
  const row = db
    .prepare("SELECT * FROM tartarus_objects WHERE source_table = ? AND source_id = ?")
    .get(sourceTable, sourceId);
  return row ? mapObjectRow(row) : null;
};

export const searchTartarusObjects = (
  query: string,
  type?: string,
  limit: number = 20,
): TartarusObject[] => {
  if (!db) throw new Error("Database not initialized");
  const pattern = `%${query}%`;

  let sql = `SELECT * FROM tartarus_objects WHERE (title LIKE ? OR summary LIKE ? OR tags LIKE ?)`;
  const params: (string | number)[] = [pattern, pattern, pattern];

  if (type) {
    sql += " AND type = ?";
    params.push(type);
  }

  sql += " ORDER BY updated_at DESC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  return rows.map(mapObjectRow);
};

/**
 * Batch lookup: get UUID for source table + source IDs.
 * Returns a Map<sourceId, uuid> for fast merging into indexes.
 */
export const getObjectUUIDs = (
  sourceTable: string,
  sourceIds: string[],
): Map<string, string> => {
  if (!db || sourceIds.length === 0) return new Map();
  const placeholders = sourceIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT source_id, uuid FROM tartarus_objects WHERE source_table = ? AND source_id IN (${placeholders})`,
    )
    .all(sourceTable, ...sourceIds) as { source_id: string; uuid: string }[];
  return new Map(rows.map((r) => [r.source_id, r.uuid]));
};

export const getConversationById = (
  id: number,
): { id: number; title: string; messages: string; summary: string | null; created_at: string; updated_at: string } | null => {
  if (!db) throw new Error("Database not initialized");
  const row = db
    .prepare("SELECT id, title, messages, summary, created_at, updated_at FROM chat_conversations WHERE id = ?")
    .get(id) as any;
  return row || null;
};

const parseJsonField = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const listAiIntegrations = (): any[] => {
  if (!db) throw new Error("Database not initialized");
  return db.prepare(`
    SELECT i.*, o.uuid
    FROM ai_integrations i
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_integrations' AND o.source_id = i.key
    ORDER BY i.display_name
  `).all().map((row: any) => ({
    key: row.key,
    displayName: row.display_name,
    status: row.status,
    version: row.version,
    authStatus: row.auth_status,
    sourcePaths: parseJsonField(row.source_paths, []),
    configSummary: row.config_summary,
    metadata: parseJsonField(row.metadata, {}),
    lastScannedAt: row.last_scanned_at,
    uuid: row.uuid ?? null,
  }));
};

export const getAiIntegration = (key: string): any | null => {
  if (!db) throw new Error("Database not initialized");
  const row = db.prepare(`
    SELECT i.*, o.uuid
    FROM ai_integrations i
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_integrations' AND o.source_id = i.key
    WHERE i.key = ?
  `).get(key) as any;
  if (!row) return null;
  return {
    key: row.key,
    displayName: row.display_name,
    status: row.status,
    version: row.version,
    authStatus: row.auth_status,
    sourcePaths: parseJsonField(row.source_paths, []),
    configSummary: row.config_summary,
    metadata: parseJsonField(row.metadata, {}),
    lastScannedAt: row.last_scanned_at,
    uuid: row.uuid ?? null,
  };
};

export const listAiArtifacts = (integrationKey?: string, limit = 50, offset = 0): any[] => {
  if (!db) throw new Error("Database not initialized");
  const params: any[] = [];
  const where = integrationKey ? "WHERE a.integration_key = ?" : "";
  if (integrationKey) params.push(integrationKey);
  params.push(Math.min(limit, 100), offset);
  return db.prepare(`
    SELECT a.id, a.integration_key, a.kind, a.source_path, a.title, a.summary,
           a.metadata, a.content_hash, a.created_at, a.updated_at, o.uuid
    FROM ai_artifacts a
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_artifacts' AND o.source_id = CAST(a.id AS TEXT)
    ${where}
    ORDER BY a.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params).map((row: any) => ({
    ...row,
    metadata: parseJsonField(row.metadata, {}),
  }));
};

export const getAiArtifact = (id: number): any | null => {
  if (!db) throw new Error("Database not initialized");
  const row = db.prepare(`
    SELECT a.*, o.uuid
    FROM ai_artifacts a
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_artifacts' AND o.source_id = CAST(a.id AS TEXT)
    WHERE a.id = ?
  `).get(id) as any;
  return row ? { ...row, metadata: parseJsonField(row.metadata, {}) } : null;
};

export const listAiLogSessions = (integrationKey?: string, limit = 50, offset = 0): any[] => {
  if (!db) throw new Error("Database not initialized");
  const params: any[] = [];
  const where = integrationKey ? "WHERE s.integration_key = ?" : "";
  if (integrationKey) params.push(integrationKey);
  params.push(Math.min(limit, 100), offset);
  return db.prepare(`
    SELECT s.*, o.uuid
    FROM ai_log_sessions s
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_log_sessions' AND o.source_id = CAST(s.id AS TEXT)
    ${where}
    ORDER BY COALESCE(s.updated_at, s.created_at) DESC
    LIMIT ? OFFSET ?
  `).all(...params).map((row: any) => ({
    ...row,
    metadata: parseJsonField(row.metadata, {}),
  }));
};

export const getAiLogSession = (id: number): any | null => {
  if (!db) throw new Error("Database not initialized");
  const session = db.prepare(`
    SELECT s.*, o.uuid
    FROM ai_log_sessions s
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_log_sessions' AND o.source_id = CAST(s.id AS TEXT)
    WHERE s.id = ?
  `).get(id) as any;
  if (!session) return null;
  const events = db.prepare("SELECT * FROM ai_log_events WHERE session_id = ? ORDER BY sequence").all(id).map((row: any) => ({
    id: row.id,
    sequence: row.sequence,
    timestamp: row.timestamp,
    actor: row.actor,
    eventType: row.event_type,
    text: row.text,
    tooling: parseJsonField(row.tooling, null),
    params: parseJsonField(row.params, {}),
    sourceEventType: row.source_event_type,
  }));
  return { ...session, metadata: parseJsonField(session.metadata, {}), events };
};

export const listAiProposals = (integrationKey?: string, limit = 50, offset = 0): any[] => {
  if (!db) throw new Error("Database not initialized");
  const params: any[] = [];
  const where = integrationKey ? "WHERE p.integration_key = ?" : "";
  if (integrationKey) params.push(integrationKey);
  params.push(Math.min(limit, 100), offset);
  return db.prepare(`
    SELECT p.id, p.integration_key, p.target_kind, p.target_path, p.title, p.summary,
           p.status, p.source_artifact_id, p.metadata, p.created_at, p.updated_at, o.uuid
    FROM ai_proposals p
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_proposals' AND o.source_id = CAST(p.id AS TEXT)
    ${where}
    ORDER BY p.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params).map((row: any) => ({
    ...row,
    metadata: parseJsonField(row.metadata, {}),
  }));
};

export const getAiProposal = (id: number): any | null => {
  if (!db) throw new Error("Database not initialized");
  const row = db.prepare(`
    SELECT p.*, o.uuid
    FROM ai_proposals p
    LEFT JOIN tartarus_objects o ON o.source_table = 'ai_proposals' AND o.source_id = CAST(p.id AS TEXT)
    WHERE p.id = ?
  `).get(id) as any;
  return row ? { ...row, metadata: parseJsonField(row.metadata, {}) } : null;
};

/**
 * Register an object in the tartarus_objects registry (MCP side).
 * Upserts: if source_table+source_id exists, updates; otherwise inserts with new UUID.
 */
export const registerObjectMCP = (opts: {
  type: string;
  sourceTable: string;
  sourceId: string;
  title?: string;
  summary?: string;
}): string | null => {
  if (!db) return null;
  try {
    const existing = db
      .prepare("SELECT uuid FROM tartarus_objects WHERE source_table = ? AND source_id = ?")
      .get(opts.sourceTable, opts.sourceId) as { uuid: string } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE tartarus_objects
        SET title = COALESCE(?, title), summary = COALESCE(?, summary), updated_at = CURRENT_TIMESTAMP
        WHERE uuid = ?
      `).run(opts.title ?? null, opts.summary ?? null, existing.uuid);
      return existing.uuid;
    }

    const { randomUUID } = require("node:crypto");
    const uuid = randomUUID();
    db.prepare(`
      INSERT INTO tartarus_objects (uuid, type, source_table, source_id, title, summary)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuid, opts.type, opts.sourceTable, opts.sourceId, opts.title ?? null, opts.summary ?? null);
    return uuid;
  } catch {
    return null; // Registry is non-critical
  }
};
