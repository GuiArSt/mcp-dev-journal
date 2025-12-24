import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { getDrizzleDb, journalEntries, entryAttachments } from "@/lib/db/drizzle";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery, journalQuerySchema } from "@/lib/validations";
import type { JournalEntry } from "@/lib/db/schema";

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
  }));

  return NextResponse.json({
    entries: entriesWithAttachments,
    total,
    limit,
    offset,
    has_more: offset + entries.length < total,
  });
});
