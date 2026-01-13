/**
 * Drizzle ORM Database Client
 *
 * Type-safe database client using Drizzle ORM.
 * Maintains compatibility with existing better-sqlite3 setup.
 */

import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import * as schema from "./schema";

let db: BetterSQLite3Database<typeof schema> | null = null;
let sqlite: Database.Database | null = null;

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

/**
 * Get the Drizzle database client
 */
export function getDrizzleDb(): BetterSQLite3Database<typeof schema> {
  if (db) {
    return db;
  }

  const dbPath = process.env.JOURNAL_DB_PATH
    ? path.resolve(process.env.JOURNAL_DB_PATH.replace(/^~/, os.homedir()))
    : findDatabasePath();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}. Please ensure the journal database exists.`);
  }

  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  db = drizzle(sqlite, { schema });

  return db;
}

/**
 * Get raw SQLite connection for legacy queries during migration
 */
export function getRawSqlite(): Database.Database {
  if (!sqlite) {
    getDrizzleDb(); // Initialize
  }
  return sqlite!;
}

/**
 * Close database connection
 */
export function closeDrizzleDb() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

// Re-export schema and types for convenience
export * from "./schema";
