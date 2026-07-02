#!/usr/bin/env npx tsx
/**
 * Backfill script: Populate tartarus_objects registry from existing data.
 *
 * Run with:
 *   JOURNAL_DB_PATH=./data/journal.db npx tsx web/scripts/backfill-object-registry.ts
 *
 * Safe to re-run — uses INSERT OR IGNORE on the UNIQUE(source_table, source_id) constraint.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";

const DB_PATH =
  process.env.JOURNAL_DB_PATH ||
  path.join(process.cwd(), "data", "journal.db");

interface BackfillSource {
  type: string;
  sourceTable: string;
  query: string; // SQL that returns (source_id, title, summary)
}

const SOURCES: BackfillSource[] = [
  {
    type: "journal_entry",
    sourceTable: "journal_entries",
    query: `SELECT commit_hash AS source_id, why AS title, summary FROM journal_entries`,
  },
  {
    type: "project_summary",
    sourceTable: "repository_overviews",
    query: `SELECT repository AS source_id, repository AS title, summary FROM repository_overviews`,
  },
  {
    type: "document",
    sourceTable: "documents",
    query: `SELECT slug AS source_id, title, summary FROM documents`,
  },
  {
    type: "prompt",
    sourceTable: "prompts",
    query: `SELECT slug AS source_id, name AS title, summary FROM prompts`,
  },
  {
    type: "conversation",
    sourceTable: "chat_conversations",
    query: `SELECT CAST(id AS TEXT) AS source_id, title, summary FROM chat_conversations`,
  },
  {
    type: "linear_project",
    sourceTable: "linear_projects",
    query: `SELECT id AS source_id, name AS title, summary FROM linear_projects WHERE is_deleted = 0`,
  },
  {
    type: "linear_issue",
    sourceTable: "linear_issues",
    query: `SELECT id AS source_id, (identifier || ': ' || title) AS title, summary FROM linear_issues WHERE is_deleted = 0`,
  },
  {
    type: "slite_note",
    sourceTable: "slite_notes",
    query: `SELECT id AS source_id, title, summary FROM slite_notes WHERE is_deleted = 0`,
  },
  {
    type: "notion_page",
    sourceTable: "notion_pages",
    query: `SELECT id AS source_id, title, summary FROM notion_pages WHERE is_deleted = 0`,
  },
  {
    type: "media_asset",
    sourceTable: "media_assets",
    query: `SELECT CAST(id AS TEXT) AS source_id, filename AS title, description AS summary FROM media_assets`,
  },
  {
    type: "skill",
    sourceTable: "skills",
    query: `SELECT id AS source_id, name AS title, summary FROM skills`,
  },
  {
    type: "work_experience",
    sourceTable: "work_experience",
    query: `SELECT id AS source_id, (title || ' at ' || company) AS title, summary FROM work_experience`,
  },
  {
    type: "education",
    sourceTable: "education",
    query: `SELECT id AS source_id, (degree || ' in ' || field) AS title, summary FROM education`,
  },
  {
    type: "portfolio_project",
    sourceTable: "portfolio_projects",
    query: `SELECT id AS source_id, title, summary FROM portfolio_projects`,
  },
  {
    type: "portfolio_product",
    sourceTable: "portfolio_products",
    query: `SELECT id AS source_id, title, tagline AS summary FROM portfolio_products`,
  },
  {
    type: "attachment",
    sourceTable: "entry_attachments",
    query: `SELECT CAST(id AS TEXT) AS source_id, filename AS title, description AS summary FROM entry_attachments`,
  },
  {
    type: "media_digest",
    sourceTable: "media_digests",
    query: `SELECT CAST(id AS TEXT) AS source_id, title, summary FROM media_digests`,
  },
];

async function backfill() {
  console.log("Backfilling tartarus_objects registry...");
  console.log(`Database: ${DB_PATH}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  // Ensure registry table exists
  db.exec(`
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tartarus_objects_type ON tartarus_objects(type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tartarus_objects_source ON tartarus_objects(source_table, source_id)`);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO tartarus_objects (uuid, type, source_table, source_id, title, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const source of SOURCES) {
    // Check if table exists
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(source.sourceTable);

    if (!tableExists) {
      console.log(`  [skip] ${source.sourceTable} — table does not exist`);
      continue;
    }

    let rows: { source_id: string; title: string | null; summary: string | null }[];
    try {
      rows = db.prepare(source.query).all() as typeof rows;
    } catch (err: any) {
      console.log(`  [skip] ${source.sourceTable} — query error: ${err.message}`);
      continue;
    }

    let inserted = 0;
    const tx = db.transaction(() => {
      for (const row of rows) {
        const result = insertStmt.run(
          randomUUID(),
          source.type,
          source.sourceTable,
          row.source_id,
          row.title || null,
          row.summary || null,
        );
        if (result.changes > 0) inserted++;
      }
    });

    tx();

    const skipped = rows.length - inserted;
    totalInserted += inserted;
    totalSkipped += skipped;

    console.log(
      `  ${source.type}: ${inserted} registered` +
        (skipped > 0 ? `, ${skipped} already existed` : "") +
        ` (${rows.length} total in source)`,
    );
  }

  // Print summary
  const totalObjects = (
    db.prepare("SELECT COUNT(*) as count FROM tartarus_objects").get() as { count: number }
  ).count;

  const typeCounts = db
    .prepare("SELECT type, COUNT(*) as count FROM tartarus_objects GROUP BY type ORDER BY count DESC")
    .all() as { type: string; count: number }[];

  console.log(`\nDone. ${totalInserted} new objects registered, ${totalSkipped} already existed.`);
  console.log(`Total objects in registry: ${totalObjects}`);
  console.log("\nBreakdown by type:");
  for (const { type, count } of typeCounts) {
    console.log(`  ${type}: ${count}`);
  }

  db.close();
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
