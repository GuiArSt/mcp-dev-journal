#!/usr/bin/env node
/**
 * Push SQLite vault rows to Supabase Postgres (fortress mirror).
 * Blobs stay local until B2 upload (media_assets.data, entry_attachments.data omitted).
 *
 * Usage:
 *   node scripts/fortress-push.mjs [--tier=a|b|all] [--table=name] [--dry-run]
 *
 * Env (from repo root .env):
 *   JOURNAL_DB_PATH, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
 */

import dotenv from "dotenv";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(root, ".env") });

const dbPath = process.env.JOURNAL_DB_PATH || path.join(root, "data", "journal.db");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const BATCH = 200;
const BATCH_BY_TABLE = {
  chat_conversations: 5,
  slack_messages: 100,
  ai_traces: 50,
};
const OMIT_COLUMNS = {
  media_assets: new Set(["data"]),
  entry_attachments: new Set(["data"]),
};

/** Push order respects FK dependencies */
const TIER_A = [
  "repository_overviews",
  "journal_entries",
  "documents",
  "portfolio_projects",
  "portfolio_products",
  "skill_categories",
  "document_types",
  "skills",
  "work_experience",
  "education",
  "prompts",
  "prompt_projects",
  "prompt_entry_links",
  "chat_conversations",
  "media_assets",
  "entry_attachments",
  "tartarus_objects",
  "tartarus_object_history",
  "muse_config",
  "ai_prompt_versions",
  "ai_prompt_active",
  "ai_integrations",
  "kronus_context_sections",
  "kronus_context_metrics_meta",
];

const TIER_B = [
  "slack_users",
  "slack_conversations",
  "slack_messages",
  "slack_sync_state",
  "slack_conversation_summary_runs",
  "notion_pages",
  "slite_notes",
  "linear_projects",
  "linear_issues",
  "linear_project_updates",
  "ai_traces",
  "ai_log_sessions",
  "ai_log_events",
  "client_memlog",
  "client_errors",
  "artemis_companies",
  "artemis_job_positions",
  "artemis_applications",
  "artemis_application_artifacts",
  "artemis_communications",
  "artemis_tasks",
  "media_digests",
  "public_media",
  "kronus_context_metrics_cache",
  "kronus_context_section_metrics",
  "atropos_corrections",
  "atropos_memories",
  "atropos_dictionary",
  "atropos_stats",
  "hermes_translations",
  "hermes_memories",
  "hermes_dictionary",
  "hermes_stats",
  "athena_learning_items",
  "athena_sessions",
  "ai_artifacts",
  "ai_proposals",
  "prompt_trace_links",
];

function parseArgs() {
  const tierArg = process.argv.find((a) => a.startsWith("--tier="));
  const tableArg = process.argv.find((a) => a.startsWith("--table="));
  return {
    tier: tierArg?.split("=")[1] || "a",
    table: tableArg?.split("=")[1],
    dryRun: process.argv.includes("--dry-run"),
  };
}

function tableList(tier, single) {
  if (single) return [single];
  if (tier === "all") return [...TIER_A, ...TIER_B];
  if (tier === "b") return TIER_B;
  return TIER_A;
}

function rowChecksum(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16);
}

function stripRow(table, row) {
  const omit = OMIT_COLUMNS[table];
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (omit?.has(k)) continue;
    out[k.toLowerCase()] = v;
  }
  return out;
}

const CONFLICT_COLUMN = {
  repository_overviews: "id",
  tartarus_objects: "uuid",
  ai_prompt_active: "prompt_slug",
  ai_integrations: "key",
  kronus_context_sections: "section_key",
  kronus_context_section_metrics: "section_key",
  kronus_context_metrics_cache: "id",
  kronus_context_metrics_meta: "id",
  muse_config: "id",
  slack_sync_state: "scope",
};

function conflictColumn(sqlite, table) {
  if (CONFLICT_COLUMN[table]) return CONFLICT_COLUMN[table];
  const cols = sqlite.prepare(`PRAGMA table_info("${table}")`).all();
  const pkCols = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
  if (pkCols.length === 1) return pkCols[0].name.toLowerCase();
  throw new Error(`Cannot determine upsert conflict column for ${table}`);
}

async function pushTable(sb, sqlite, table, dryRun) {
  const cols = sqlite.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
  const omit = OMIT_COLUMNS[table] || new Set();
  const selectCols = cols.filter((c) => !omit.has(c)).map((c) => `"${c}"`).join(", ");
  const rows = sqlite.prepare(`SELECT ${selectCols} FROM "${table}"`).all();

  if (rows.length === 0) {
    console.log(`  ${table}: skip (0 rows)`);
    return { table, sqlite: 0, pushed: 0 };
  }

  if (dryRun) {
    console.log(`  ${table}: dry-run ${rows.length} rows`);
    return { table, sqlite: rows.length, pushed: 0 };
  }

  let pushed = 0;
  const batchSize = BATCH_BY_TABLE[table] ?? BATCH;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize).map((r) => stripRow(table, r));
    const { error } = await sb.from(table).upsert(chunk, {
      onConflict: conflictColumn(sqlite, table),
      ignoreDuplicates: false,
    });
    if (error) {
      throw new Error(`${table} batch @${i}: ${error.message}`);
    }
    pushed += chunk.length;
    if (rows.length > batchSize) {
      process.stdout.write(`\r  ${table}: ${pushed}/${rows.length}`);
    }
  }
  if (rows.length > batchSize) process.stdout.write("\n");
  else console.log(`  ${table}: ${pushed} rows`);

  const checksum = rowChecksum(rows);
  await sb.from("fortress_sync_meta").upsert(
    {
      table_name: table,
      sqlite_row_count: rows.length,
      pushed_row_count: pushed,
      last_pushed_at: new Date().toISOString(),
      checksum,
    },
    { onConflict: "table_name" },
  );

  return { table, sqlite: rows.length, pushed };
}

async function main() {
  const { tier, table, dryRun } = parseArgs();

  if (!fs.existsSync(dbPath)) {
    console.error(`SQLite not found: ${dbPath}`);
    process.exit(1);
  }
  if (!supabaseUrl || !supabaseKey) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env");
    process.exit(1);
  }

  const tables = tableList(tier, table);
  const sqlite = new Database(dbPath, { readonly: true });
  const sb = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Fortress push — tier=${tier}${dryRun ? " (dry-run)" : ""}`);
  console.log(`SQLite: ${dbPath}`);
  console.log(`Supabase: ${supabaseUrl}\n`);

  const results = [];
  for (const t of tables) {
    try {
      results.push(await pushTable(sb, sqlite, t, dryRun));
    } catch (err) {
      console.error(`\nFAILED ${t}:`, err.message);
      sqlite.close();
      process.exit(1);
    }
  }

  sqlite.close();
  const total = results.reduce((s, r) => s + r.pushed, 0);
  console.log(`\nDone — ${total} rows pushed across ${results.length} tables.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
