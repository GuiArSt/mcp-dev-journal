import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { triggerBackup } from "@/lib/backup";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody, updateJournalEntrySchema } from "@/lib/validations";
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors";
import { getDrizzleDb, journalEntries, entryAttachments, athenaLearningItems } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";

/**
 * Verify request is from manual UI action, not programmatic access (MCP/Kronus)
 * Requires X-Manual-Action: true header
 */
function requireManualAction(request: NextRequest): void {
  const manualHeader = request.headers.get("X-Manual-Action");
  if (manualHeader !== "true") {
    throw new ForbiddenError(
      "Delete operations require manual confirmation. This action cannot be performed by AI agents or automated tools."
    );
  }
}

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

/**
 * DELETE /api/entries/[commitHash]
 * Delete a single journal entry and all related data
 */
export const DELETE = withErrorHandler<{ commitHash: string }>(async (
  request: NextRequest,
  context
) => {
  // Require manual action header - prevents MCP/Kronus from deleting entries
  requireManualAction(request);

  const { commitHash } = await context!.params;
  const db = getDrizzleDb();

  // Check entry exists
  const [entry] = await db
    .select({ commitHash: journalEntries.commitHash, repository: journalEntries.repository })
    .from(journalEntries)
    .where(eq(journalEntries.commitHash, commitHash))
    .limit(1);

  if (!entry) {
    throw new NotFoundError("Entry not found");
  }

  // Delete related Athena learning items for this commit
  await db
    .delete(athenaLearningItems)
    .where(eq(athenaLearningItems.commitHash, commitHash));

  // Delete attachments (cascade should handle this, but be explicit)
  await db
    .delete(entryAttachments)
    .where(eq(entryAttachments.commitHash, commitHash));

  // Delete the entry
  await db
    .delete(journalEntries)
    .where(eq(journalEntries.commitHash, commitHash));

  // Trigger backup after deletion
  try {
    triggerBackup();
  } catch (error) {
    console.error("Backup failed after delete:", error);
  }

  return NextResponse.json({
    success: true,
    deleted: {
      commitHash,
      repository: entry.repository,
    },
  });
});
