/**
 * Backup utility for web app
 * Triggers database backups when changes are made via web interface
 */

import { getDatabase } from "./db";
import path from "path";
import fs from "fs";

function getProjectRoot(): string {
  let currentDir = process.cwd();

  // If we're in the web folder, go up one level
  if (path.basename(currentDir) === "web") {
    currentDir = path.dirname(currentDir);
  }

  return currentDir;
}

export function triggerBackup() {
  try {
    const projectRoot = getProjectRoot();
    const parentDir = path.dirname(projectRoot);
    const isLocalMode =
      path.basename(parentDir) === "Laboratory" &&
      path.basename(projectRoot) === "Developer Journal Workspace";

    let backupPath: string;
    if (isLocalMode) {
      backupPath = path.join(parentDir, "journal_backup.sql");
    } else {
      backupPath = path.join(projectRoot, "journal_backup.sql");
    }

    exportToSQL(backupPath);
    return backupPath;
  } catch (error) {
    console.error("Failed to trigger backup:", error);
    throw error;
  }
}

function exportToSQL(outputPath: string): void {
  const db = getDatabase();

  const entries = db
    .prepare("SELECT * FROM journal_entries ORDER BY created_at ASC")
    .all() as any[];
  const summaries = db
    .prepare("SELECT * FROM project_summaries ORDER BY repository ASC")
    .all() as any[];

  const attachmentMetadata = db
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
      summary.updated_at,
    ].map((v) => {
      if (v === null) return "NULL";
      if (typeof v === "string") {
        return `'${v.replace(/'/g, "''")}'`;
      }
      return String(v);
    });

    sql += `INSERT INTO project_summaries (repository, git_url, summary, purpose, architecture, key_decisions, technologies, status, updated_at) VALUES (${values.join(", ")});\n`;
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










