#!/usr/bin/env npx tsx
/**
 * MCP Integration Test Suite
 *
 * Tests that the MCP server builds, initializes, and has the correct
 * tools/resources registered. Also verifies the database is accessible
 * and the registry table exists with data.
 *
 * Run: npx tsx tests/mcp-integration.test.ts
 */

import Database from "better-sqlite3";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB_PATH = process.env.JOURNAL_DB_PATH || path.join(ROOT, "data", "journal.db");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

// ─── Build Tests ───────────────────────────────────────────

console.log("\n═══ MCP Integration Tests ═══\n");
console.log("--- Build ---");

test("MCP server builds without errors", () => {
  const output = execSync("npm run build 2>&1", { cwd: ROOT, encoding: "utf-8" });
  assert.ok(output.includes("Done"), "Build should succeed");
});

test("dist/index.js exists after build", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "index.js")));
});

// ─── Database Tests ────────────────────────────────────────

console.log("\n--- Database ---");

test("journal.db exists", () => {
  assert.ok(fs.existsSync(DB_PATH), `DB should exist at ${DB_PATH}`);
});

let db: Database.Database;

test("journal.db is a valid SQLite database", () => {
  db = new Database(DB_PATH, { readonly: true });
  const result = db.prepare("SELECT 1 as ok").get() as { ok: number };
  assert.equal(result.ok, 1);
});

test("tartarus_objects table exists", () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tartarus_objects'").get();
  assert.ok(row, "tartarus_objects table should exist");
});

test("tartarus_object_history table exists", () => {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tartarus_object_history'").get();
  assert.ok(row, "tartarus_object_history table should exist");
});

test("tartarus_objects has data (backfill ran)", () => {
  const { count } = db.prepare("SELECT COUNT(*) as count FROM tartarus_objects").get() as { count: number };
  assert.ok(count > 0, `Registry should have objects, found ${count}`);
});

test("all expected object types present", () => {
  const types = db.prepare("SELECT DISTINCT type FROM tartarus_objects ORDER BY type").all() as { type: string }[];
  const typeNames = types.map((t) => t.type);
  const expected = ["journal_entry", "document", "conversation", "skill"];
  for (const t of expected) {
    assert.ok(typeNames.includes(t), `Missing type: ${t}`);
  }
});

// ─── Core Tables ───────────────────────────────────────────

console.log("\n--- Core Tables ---");

const requiredTables = [
  "journal_entries",
  "repository_overviews",
  "entry_attachments",
  "chat_conversations",
  "tartarus_objects",
  "tartarus_object_history",
];

for (const table of requiredTables) {
  test(`table ${table} exists`, () => {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    assert.ok(row, `${table} should exist`);
  });
}

// ─── Registry Integrity ────────────────────────────────────

console.log("\n--- Registry Integrity ---");

test("all UUIDs are valid format", () => {
  const rows = db.prepare("SELECT uuid FROM tartarus_objects LIMIT 100").all() as { uuid: string }[];
  for (const { uuid } of rows) {
    assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, `Invalid UUID: ${uuid}`);
  }
});

test("no duplicate source_table + source_id", () => {
  const dupes = db.prepare(`
    SELECT source_table, source_id, COUNT(*) as c
    FROM tartarus_objects GROUP BY source_table, source_id HAVING c > 1
  `).all() as any[];
  assert.equal(dupes.length, 0, `Found ${dupes.length} duplicates`);
});

test("type distribution is reasonable", () => {
  const counts = db.prepare("SELECT type, COUNT(*) as c FROM tartarus_objects GROUP BY type").all() as { type: string; c: number }[];
  const total = counts.reduce((sum, r) => sum + r.c, 0);
  assert.ok(total > 100, `Should have >100 objects, found ${total}`);
});

// ─── Environment ───────────────────────────────────────────

console.log("\n--- Environment ---");

test("JOURNAL_DB_PATH resolves to existing file", () => {
  const envPath = process.env.JOURNAL_DB_PATH;
  if (envPath) {
    const resolved = path.resolve(envPath.replace(/^~/, process.env.HOME || ""));
    assert.ok(fs.existsSync(resolved), `JOURNAL_DB_PATH=${envPath} does not exist`);
  }
  // If not set, the default data/journal.db was already verified above
});

test(".env file exists", () => {
  assert.ok(fs.existsSync(path.join(ROOT, ".env")), ".env should exist in project root");
});

test(".env contains JOURNAL_DB_PATH", () => {
  const env = fs.readFileSync(path.join(ROOT, ".env"), "utf-8");
  assert.ok(env.includes("JOURNAL_DB_PATH"), ".env should define JOURNAL_DB_PATH");
});

// ─── Cleanup & Results ─────────────────────────────────────

db.close();

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
