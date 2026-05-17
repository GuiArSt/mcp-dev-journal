#!/usr/bin/env npx ts-node
/**
 * Database Sync Script
 * Maintains parity between local SQLite and remote Supabase
 *
 * Usage:
 *   npx ts-node scripts/sync-db.ts export   # Export SQLite to Supabase
 *   npx ts-node scripts/sync-db.ts import   # Import Supabase to SQLite
 *   npx ts-node scripts/sync-db.ts compare  # Compare databases
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Configuration
const SQLITE_PATH = process.env.JOURNAL_DB_PATH || path.join(__dirname, "..", "..", "journal.db");
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Need service role for DB access

interface JournalEntry {
  id?: number;
  commit_hash: string;
  repository: string;
  branch: string;
  author: string;
  date: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
  raw_agent_report: string;
  created_at: string;
}

interface ProjectSummary {
  id?: number;
  repository: string;
  git_url: string;
  summary: string;
  purpose: string;
  architecture: string;
  key_decisions: string;
  technologies: string;
  status: string;
  linear_project_id?: string | null;
  linear_issue_id?: string | null;
  updated_at: string;
}

interface Conversation {
  id?: number;
  title: string;
  messages: string; // JSON string
  created_at: string;
  updated_at: string;
}

function getSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function getSQLiteDB(): Database.Database {
  if (!fs.existsSync(SQLITE_PATH)) {
    throw new Error(`SQLite database not found at ${SQLITE_PATH}`);
  }
  const db = new Database(SQLITE_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

async function exportToSupabase() {
  console.log("📤 Exporting SQLite to Supabase...\n");

  const sqlite = getSQLiteDB();
  const supabase = getSupabaseClient();

  // Export journal entries
  console.log("  Exporting journal entries...");
  const entries = sqlite.prepare("SELECT * FROM journal_entries").all() as JournalEntry[];

  for (const entry of entries) {
    const { id, ...data } = entry;
    const { error } = await supabase
      .from("journal_entries")
      .upsert(data, { onConflict: "commit_hash" });

    if (error) {
      console.error(`    ❌ Error exporting ${entry.commit_hash}:`, error.message);
    }
  }
  console.log(`    ✅ Exported ${entries.length} entries`);

  // Export Repository overviews (Entry 0)
  console.log("  Exporting repository overviews...");
  const summaries = sqlite.prepare("SELECT * FROM repository_overviews").all() as ProjectSummary[];

  for (const summary of summaries) {
    const { id, ...data } = summary;
    const { error } = await supabase
      .from("repository_overviews")
      .upsert(data, { onConflict: "repository" });

    if (error) {
      console.error(`    ❌ Error exporting ${summary.repository}:`, error.message);
    }
  }
  console.log(`    ✅ Exported ${summaries.length} summaries`);

  // Export conversations
  console.log("  Exporting conversations...");
  try {
    const conversations = sqlite
      .prepare("SELECT * FROM chat_conversations")
      .all() as Conversation[];

    for (const conv of conversations) {
      const { error } = await supabase.from("chat_conversations").upsert(
        {
          id: conv.id,
          title: conv.title,
          messages: conv.messages,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error(`    ❌ Error exporting conversation ${conv.id}:`, error.message);
      }
    }
    console.log(`    ✅ Exported ${conversations.length} conversations`);
  } catch (e) {
    console.log("    ⚠️ No conversations table found (skipping)");
  }

  sqlite.close();
  console.log("\n✅ Export complete!");
}

async function importFromSupabase() {
  console.log("📥 Importing Supabase to SQLite...\n");

  const sqlite = getSQLiteDB();
  const supabase = getSupabaseClient();

  // Import journal entries
  console.log("  Importing journal entries...");
  const { data: entries, error: entriesError } = await supabase.from("journal_entries").select("*");

  if (entriesError) {
    console.error("    ❌ Error fetching entries:", entriesError.message);
  } else if (entries) {
    const stmt = sqlite.prepare(`
      INSERT OR REPLACE INTO journal_entries 
      (commit_hash, repository, branch, author, date, why, what_changed, decisions, technologies, kronus_wisdom, raw_agent_report, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entry of entries) {
      stmt.run(
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
        entry.created_at
      );
    }
    console.log(`    ✅ Imported ${entries.length} entries`);
  }

  // Import Repository overviews
  console.log("  Importing repository overviews...");
  const { data: summaries, error: summariesError } = await supabase
    .from("repository_overviews")
    .select("*");

  if (summariesError) {
    console.error("    ❌ Error fetching summaries:", summariesError.message);
  } else if (summaries) {
    const stmt = sqlite.prepare(`
      INSERT OR REPLACE INTO repository_overviews 
      (repository, git_url, summary, purpose, architecture, key_decisions, technologies, status, linear_project_id, linear_issue_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of summaries) {
      stmt.run(
        s.repository,
        s.git_url,
        s.summary,
        s.purpose,
        s.architecture,
        s.key_decisions,
        s.technologies,
        s.status,
        s.linear_project_id,
        s.linear_issue_id,
        s.updated_at
      );
    }
    console.log(`    ✅ Imported ${summaries.length} summaries`);
  }

  // Import conversations
  console.log("  Importing conversations...");
  const { data: conversations, error: convsError } = await supabase
    .from("chat_conversations")
    .select("*");

  if (convsError) {
    console.log("    ⚠️ No conversations table in Supabase (skipping)");
  } else if (conversations) {
    // Ensure table exists
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        messages TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const stmt = sqlite.prepare(`
      INSERT OR REPLACE INTO chat_conversations (id, title, messages, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const c of conversations) {
      stmt.run(c.id, c.title, c.messages, c.created_at, c.updated_at);
    }
    console.log(`    ✅ Imported ${conversations.length} conversations`);
  }

  sqlite.close();
  console.log("\n✅ Import complete!");
}

async function compareDatabases() {
  console.log("🔍 Comparing SQLite and Supabase...\n");

  const sqlite = getSQLiteDB();
  const supabase = getSupabaseClient();

  // Compare journal entries
  console.log("📝 Journal Entries:");
  const localEntries = sqlite
    .prepare("SELECT commit_hash, repository, updated_at FROM journal_entries")
    .all() as any[];
  const { data: remoteEntries } = await supabase
    .from("journal_entries")
    .select("commit_hash, repository, updated_at");

  const localHashes = new Set(localEntries.map((e) => e.commit_hash));
  const remoteHashes = new Set((remoteEntries || []).map((e) => e.commit_hash));

  const onlyLocal = localEntries.filter((e) => !remoteHashes.has(e.commit_hash));
  const onlyRemote = (remoteEntries || []).filter((e) => !localHashes.has(e.commit_hash));

  console.log(`  Local: ${localEntries.length} entries`);
  console.log(`  Remote: ${(remoteEntries || []).length} entries`);
  console.log(`  Only in local: ${onlyLocal.length}`);
  console.log(`  Only in remote: ${onlyRemote.length}`);

  if (onlyLocal.length > 0) {
    console.log("  Local-only entries:");
    onlyLocal
      .slice(0, 5)
      .forEach((e) => console.log(`    - ${e.commit_hash.substring(0, 7)} (${e.repository})`));
    if (onlyLocal.length > 5) console.log(`    ... and ${onlyLocal.length - 5} more`);
  }

  if (onlyRemote.length > 0) {
    console.log("  Remote-only entries:");
    onlyRemote
      .slice(0, 5)
      .forEach((e) => console.log(`    - ${e.commit_hash.substring(0, 7)} (${e.repository})`));
    if (onlyRemote.length > 5) console.log(`    ... and ${onlyRemote.length - 5} more`);
  }

  // Compare Repository overviews
  console.log("\n📊 Repository overviews (Entry 0):");
  const localSummaries = sqlite.prepare("SELECT repository FROM repository_overviews").all() as any[];
  const { data: remoteSummaries } = await supabase
    .from("repository_overviews")
    .select("repository");

  console.log(`  Local: ${localSummaries.length} rows`);
  console.log(`  Remote: ${(remoteSummaries || []).length} rows`);

  // Compare conversations
  console.log("\n💬 Conversations:");
  try {
    const localConvs = sqlite
      .prepare("SELECT COUNT(*) as count FROM chat_conversations")
      .get() as any;
    console.log(`  Local: ${localConvs.count} conversations`);
  } catch {
    console.log("  Local: 0 conversations (table not found)");
  }

  const { data: remoteConvs } = await supabase.from("chat_conversations").select("id");
  console.log(`  Remote: ${(remoteConvs || []).length} conversations`);

  sqlite.close();
  console.log("\n✅ Comparison complete!");
}

// Main
const command = process.argv[2];

switch (command) {
  case "export":
    exportToSupabase().catch(console.error);
    break;
  case "import":
    importFromSupabase().catch(console.error);
    break;
  case "compare":
    compareDatabases().catch(console.error);
    break;
  default:
    console.log(`
Database Sync Script
====================

Usage:
  npx ts-node scripts/sync-db.ts <command>

Commands:
  export   Export local SQLite data to Supabase
  import   Import Supabase data to local SQLite
  compare  Compare databases and show differences

Environment Variables:
  JOURNAL_DB_PATH           Path to SQLite database (default: ../journal.db)
  SUPABASE_URL              Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY Supabase service role key (with DB access)
`);
}
