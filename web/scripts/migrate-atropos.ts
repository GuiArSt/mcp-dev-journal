#!/usr/bin/env npx tsx
/**
 * Migration script: Normalize Atropos tables
 *
 * This script:
 * 1. Creates new normalized tables (corrections, memories, dictionary, stats)
 * 2. Migrates existing data from atropos_memory JSON fields to normalized tables
 * 3. Preserves the old table for backwards compatibility
 *
 * Run with: npx tsx scripts/migrate-atropos.ts
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "..", "journal.db");

interface LegacyMemory {
  content: string;
  tags?: string[];
  createdAt?: string;
}

interface LegacyAtroposRow {
  id: number;
  user_id: string;
  custom_dictionary: string;
  memories: string;
  total_checks: number;
  total_corrections: number;
  created_at: string;
  updated_at: string;
}

async function migrate() {
  console.log("🔄 Starting Atropos migration...");
  console.log(`📂 Database path: ${DB_PATH}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌ Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  try {
    // Step 1: Run the SQL migration
    console.log("\n📝 Creating new tables...");
    const migrationPath = path.join(__dirname, "..", "lib", "db", "migrations", "001_atropos_normalized.sql");

    if (fs.existsSync(migrationPath)) {
      const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
      db.exec(migrationSQL);
      console.log("✅ Tables created successfully");
    } else {
      // Inline the SQL if file not found (for direct execution)
      console.log("⚠️  Migration file not found, creating tables inline...");
      db.exec(`
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

        CREATE INDEX IF NOT EXISTS idx_atropos_corrections_user_id ON atropos_corrections(user_id);
        CREATE INDEX IF NOT EXISTS idx_atropos_corrections_source ON atropos_corrections(source_context);
        CREATE INDEX IF NOT EXISTS idx_atropos_corrections_created ON atropos_corrections(created_at DESC);

        CREATE TABLE IF NOT EXISTS atropos_memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          content TEXT NOT NULL,
          tags TEXT DEFAULT '[]',
          frequency INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_atropos_memories_user_id ON atropos_memories(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_atropos_memories_unique ON atropos_memories(user_id, content);

        CREATE TABLE IF NOT EXISTS atropos_dictionary (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          term TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_atropos_dictionary_user_id ON atropos_dictionary(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_atropos_dictionary_unique ON atropos_dictionary(user_id, term);

        CREATE TABLE IF NOT EXISTS atropos_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          total_checks INTEGER DEFAULT 0,
          total_corrections INTEGER DEFAULT 0,
          total_characters_corrected INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_atropos_stats_user_id ON atropos_stats(user_id);
      `);
      console.log("✅ Tables created successfully");
    }

    // Step 2: Check if legacy table exists and has data
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='atropos_memory'"
    ).get();

    if (!tableCheck) {
      console.log("ℹ️  No legacy atropos_memory table found. Skipping data migration.");
      return;
    }

    // Step 3: Get all legacy data
    console.log("\n📊 Reading legacy data...");
    const legacyRows = db.prepare("SELECT * FROM atropos_memory").all() as LegacyAtroposRow[];
    console.log(`   Found ${legacyRows.length} user(s) to migrate`);

    if (legacyRows.length === 0) {
      console.log("ℹ️  No data to migrate.");
      return;
    }

    // Step 4: Migrate each user's data
    const insertMemory = db.prepare(`
      INSERT OR IGNORE INTO atropos_memories (user_id, content, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const insertDictTerm = db.prepare(`
      INSERT OR IGNORE INTO atropos_dictionary (user_id, term, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    const insertStats = db.prepare(`
      INSERT OR REPLACE INTO atropos_stats (user_id, total_checks, total_corrections, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    let totalMemories = 0;
    let totalTerms = 0;

    for (const row of legacyRows) {
      console.log(`\n👤 Migrating user: ${row.user_id}`);

      // Migrate memories
      try {
        const memories: LegacyMemory[] = JSON.parse(row.memories || "[]");
        console.log(`   📝 Memories: ${memories.length}`);

        for (const memory of memories) {
          insertMemory.run(
            row.user_id,
            memory.content,
            JSON.stringify(memory.tags || []),
            memory.createdAt || row.created_at
          );
          totalMemories++;
        }
      } catch (e) {
        console.error(`   ⚠️  Failed to parse memories: ${e}`);
      }

      // Migrate dictionary
      try {
        const dictionary: string[] = JSON.parse(row.custom_dictionary || "[]");
        console.log(`   📖 Dictionary terms: ${dictionary.length}`);

        for (const term of dictionary) {
          insertDictTerm.run(row.user_id, term);
          totalTerms++;
        }
      } catch (e) {
        console.error(`   ⚠️  Failed to parse dictionary: ${e}`);
      }

      // Migrate stats
      insertStats.run(row.user_id, row.total_checks, row.total_corrections);
      console.log(`   📈 Stats: ${row.total_checks} checks, ${row.total_corrections} corrections`);
    }

    console.log("\n✅ Migration complete!");
    console.log(`   📝 Memories migrated: ${totalMemories}`);
    console.log(`   📖 Dictionary terms migrated: ${totalTerms}`);
    console.log(`   👤 Users migrated: ${legacyRows.length}`);

    // Step 5: Verify migration
    console.log("\n🔍 Verifying migration...");
    const memoriesCount = db.prepare("SELECT COUNT(*) as count FROM atropos_memories").get() as { count: number };
    const dictCount = db.prepare("SELECT COUNT(*) as count FROM atropos_dictionary").get() as { count: number };
    const statsCount = db.prepare("SELECT COUNT(*) as count FROM atropos_stats").get() as { count: number };

    console.log(`   atropos_memories: ${memoriesCount.count} rows`);
    console.log(`   atropos_dictionary: ${dictCount.count} rows`);
    console.log(`   atropos_stats: ${statsCount.count} rows`);

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate().catch(console.error);
