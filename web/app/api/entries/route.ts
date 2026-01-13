import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, sql, count, inArray } from "drizzle-orm";
import { getDrizzleDb, journalEntries, entryAttachments, projectSummaries, athenaLearningItems, athenaSessions } from "@/lib/db/drizzle";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery, journalQuerySchema } from "@/lib/validations";
import { ValidationError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { triggerBackup } from "@/lib/backup";
import type { JournalEntry } from "@/lib/db/schema";

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

/**
 * GET /api/entries
 * List journal entries with optional filtering by repository/branch
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { repository, branch, limit, offset } = requireQuery(journalQuerySchema, request);
  const db = getDrizzleDb();

  // Build where conditions
  const conditions = [];
  if (repository) conditions.push(eq(journalEntries.repository, repository));
  if (branch) conditions.push(eq(journalEntries.branch, branch));

  // Get entries
  const entries = await db
    .select()
    .from(journalEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(journalEntries.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const [totalResult] = await db
    .select({ count: count() })
    .from(journalEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  const total = totalResult?.count ?? 0;

  // Get attachment counts for these entries
  const commitHashes = entries.map((e) => e.commitHash);
  const attachmentCounts = new Map<string, number>();

  if (commitHashes.length > 0) {
    const attachmentRows = await db
      .select({
        commitHash: entryAttachments.commitHash,
        count: count(),
      })
      .from(entryAttachments)
      .where(sql`${entryAttachments.commitHash} IN ${commitHashes}`)
      .groupBy(entryAttachments.commitHash);

    commitHashes.forEach((hash) => attachmentCounts.set(hash, 0));
    attachmentRows.forEach((row) => attachmentCounts.set(row.commitHash, row.count));
  }

  // Map to API response format (snake_case for backwards compatibility)
  const entriesWithAttachments = entries.map((entry) => ({
    id: entry.id,
    commit_hash: entry.commitHash,
    repository: entry.repository,
    branch: entry.branch,
    author: entry.author,
    code_author: entry.codeAuthor,
    team_members: entry.teamMembers,
    date: entry.date,
    why: entry.why,
    what_changed: entry.whatChanged,
    decisions: entry.decisions,
    technologies: entry.technologies,
    kronus_wisdom: entry.kronusWisdom,
    raw_agent_report: entry.rawAgentReport,
    created_at: entry.createdAt,
    attachment_count: attachmentCounts.get(entry.commitHash) || 0,
    // File change tracking (JSON string from DB, parse if present)
    files_changed: entry.filesChanged ? JSON.parse(entry.filesChanged) : null,
  }));

  return NextResponse.json({
    entries: entriesWithAttachments,
    total,
    limit,
    offset,
    has_more: offset + entries.length < total,
  });
});

/**
 * DELETE /api/entries?repository=xxx
 * Delete all entries for a repository and all related data
 * Requires X-Manual-Action: true header (manual UI only, not MCP/Kronus)
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  // Require manual action header - prevents MCP/Kronus from deleting entries
  requireManualAction(request);

  const url = new URL(request.url);
  const repository = url.searchParams.get("repository");

  if (!repository) {
    throw new ValidationError("repository query parameter is required");
  }

  const db = getDrizzleDb();

  // Get all entries for this repository
  const entries = await db
    .select({ commitHash: journalEntries.commitHash })
    .from(journalEntries)
    .where(eq(journalEntries.repository, repository));

  if (entries.length === 0) {
    throw new NotFoundError(`No entries found for repository: ${repository}`);
  }

  const commitHashes = entries.map((e) => e.commitHash);

  // Delete related Athena learning items for this repository
  await db
    .delete(athenaLearningItems)
    .where(eq(athenaLearningItems.repository, repository));

  // Delete related Athena sessions for this repository
  await db
    .delete(athenaSessions)
    .where(eq(athenaSessions.repository, repository));

  // Delete all attachments for these entries
  if (commitHashes.length > 0) {
    await db
      .delete(entryAttachments)
      .where(inArray(entryAttachments.commitHash, commitHashes));
  }

  // Delete all entries for this repository
  await db
    .delete(journalEntries)
    .where(eq(journalEntries.repository, repository));

  // Delete the project summary for this repository
  await db
    .delete(projectSummaries)
    .where(eq(projectSummaries.repository, repository));

  // Trigger backup after deletion
  try {
    triggerBackup();
  } catch (error) {
    console.error("Backup failed after delete:", error);
  }

  return NextResponse.json({
    success: true,
    deleted: {
      repository,
      entriesCount: entries.length,
      commitHashes,
    },
  });
});
