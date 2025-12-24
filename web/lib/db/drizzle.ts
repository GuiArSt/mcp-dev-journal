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

function getProjectRoot(): string {
  let currentDir = process.cwd();

  // If we're in the web folder, go up one level
  if (path.basename(currentDir) === "web") {
    currentDir = path.dirname(currentDir);
  }

  // Check if journal.db exists here
  if (fs.existsSync(path.join(currentDir, "journal.db"))) {
    return currentDir;
  }

  return currentDir;
}

/**
 * Get the Drizzle database client
 */
export function getDrizzleDb(): BetterSQLite3Database<typeof schema> {
  if (db) {
    return db;
  }

  const projectRoot = getProjectRoot();
  const dbPath = process.env.JOURNAL_DB_PATH
    ? path.resolve(process.env.JOURNAL_DB_PATH.replace(/^~/, os.homedir()))
    : path.join(projectRoot, "journal.db");

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
