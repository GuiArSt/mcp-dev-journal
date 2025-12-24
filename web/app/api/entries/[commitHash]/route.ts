import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { triggerBackup } from "@/lib/backup";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody, updateJournalEntrySchema } from "@/lib/validations";
import { NotFoundError, ValidationError } from "@/lib/errors";

interface JournalEntryRow {
  id: number;
  commit_hash: string;
  repository: string;
  branch: string;
  author: string;
  code_author: string | null;
  team_members: string | null;
  date: string;
  why: string | null;
  what_changed: string | null;
  decisions: string | null;
  technologies: string | null;
  kronus_wisdom: string | null;
  raw_agent_report: string;
  created_at: string;
}

interface AttachmentRow {
  id: number;
  filename: string;
  mime_type: string;
  description: string | null;
  file_size: number;
  uploaded_at: string;
}

/**
 * GET /api/entries/[commitHash]
 * Get a single journal entry with attachments
 */
export const GET = withErrorHandler<{ commitHash: string }>(async (
  request: NextRequest,
  context
) => {
  const { commitHash } = await context!.params;
  const db = getDatabase();
  const entry = db.prepare("SELECT * FROM journal_entries WHERE commit_hash = ?").get(commitHash) as JournalEntryRow | undefined;

  if (!entry) {
    throw new NotFoundError("Entry not found");
  }

  // Get attachments metadata
  const attachments = db
    .prepare(
      `SELECT id, filename, mime_type, description, file_size, uploaded_at
       FROM entry_attachments
       WHERE commit_hash = ?
       ORDER BY uploaded_at ASC`
    )
    .all(commitHash) as AttachmentRow[];

  return NextResponse.json({
    ...entry,
    attachments,
  });
});

/**
 * PATCH /api/entries/[commitHash]
 * Update a journal entry
 */
export const PATCH = withErrorHandler<{ commitHash: string }>(async (
  request: NextRequest,
  context
) => {
  const { commitHash } = await context!.params;
  const db = getDatabase();
  const updates = await requireBody(updateJournalEntrySchema, request);

  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (updates.why !== undefined) {
    fields.push("why = ?");
    values.push(updates.why ?? null);
  }
  if (updates.what_changed !== undefined) {
    fields.push("what_changed = ?");
    values.push(updates.what_changed ?? null);
  }
  if (updates.decisions !== undefined) {
    fields.push("decisions = ?");
    values.push(updates.decisions ?? null);
  }
  if (updates.technologies !== undefined) {
    fields.push("technologies = ?");
    values.push(updates.technologies ?? null);
  }
  if (updates.kronus_wisdom !== undefined) {
    fields.push("kronus_wisdom = ?");
    values.push(updates.kronus_wisdom ?? null);
  }

  if (fields.length === 0) {
    throw new ValidationError("No fields to update");
  }

  values.push(commitHash);
  const sql = `UPDATE journal_entries SET ${fields.join(", ")} WHERE commit_hash = ?`;

  const result = db.prepare(sql).run(...values);

  if (result.changes === 0) {
    throw new NotFoundError("Entry not found");
  }

  // Get updated entry
  const updatedEntry = db
    .prepare("SELECT * FROM journal_entries WHERE commit_hash = ?")
    .get(commitHash) as JournalEntryRow;

  // Trigger backup after update
  try {
    triggerBackup();
  } catch (error) {
    console.error("Backup failed after update:", error);
    // Don't fail the request if backup fails
  }

  return NextResponse.json(updatedEntry);
});
