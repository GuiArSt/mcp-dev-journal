import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { normalizeRepository } from "@/lib/utils";

/**
 * GET /api/repository-overviews
 *
 * List Repository overviews (Entry 0) with journal entry counts.
 * Includes repositories that have journal entries but no overview row yet.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();

  const summaries = db
    .prepare(
      `
      WITH all_repos AS (
        SELECT repository FROM repository_overviews
        UNION
        SELECT DISTINCT repository FROM journal_entries
      )
      SELECT
        COALESCE(ps.id, -1) as id,
        ar.repository,
        ps.git_url,
        COALESCE(ps.summary, 'No summary yet. Click Analyze to generate one from journal entries.') as summary,
        ps.purpose,
        ps.architecture,
        ps.key_decisions,
        ps.technologies,
        ps.status,
        COALESCE(ps.updated_at, (SELECT MAX(created_at) FROM journal_entries je WHERE je.repository = ar.repository)) as updated_at,
        ps.linear_project_id,
        ps.linear_issue_id,
        ps.file_structure,
        ps.tech_stack,
        ps.frontend,
        ps.backend,
        ps.database_info,
        ps.services,
        ps.custom_tooling,
        ps.data_flow,
        ps.patterns,
        ps.commands,
        ps.extended_notes,
        ps.last_synced_entry,
        ps.entries_synced,
        (SELECT COUNT(*) FROM journal_entries je WHERE je.repository = ar.repository) as entry_count,
        (SELECT MAX(date) FROM journal_entries je WHERE je.repository = ar.repository) as last_entry_date
      FROM all_repos ar
      LEFT JOIN repository_overviews ps ON ps.repository = ar.repository
      ORDER BY
        (SELECT MAX(date) FROM journal_entries je WHERE je.repository = ar.repository) DESC NULLS LAST,
        ps.updated_at DESC
    `
    )
    .all();

  return NextResponse.json({
    summaries,
    total: summaries.length,
  });
});

/**
 * DELETE /api/repository-overviews?repository=xxx
 *
 * Delete a Repository overview and optionally journal entries for the repo.
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawRepository = searchParams.get("repository");
  const deleteEntries = searchParams.get("deleteEntries") === "true";

  if (!rawRepository) {
    return NextResponse.json({ error: "Repository is required" }, { status: 400 });
  }

  const repository = normalizeRepository(rawRepository);

  const db = getDatabase();

  const existing = db
    .prepare(`SELECT id FROM repository_overviews WHERE repository = ?`)
    .get(repository);

  const entryCount = db
    .prepare(`SELECT COUNT(*) as count FROM journal_entries WHERE repository = ?`)
    .get(repository) as { count: number };

  if (deleteEntries && entryCount.count > 0) {
    db.prepare(
      `
      DELETE FROM entry_attachments
      WHERE commit_hash IN (SELECT commit_hash FROM journal_entries WHERE repository = ?)
    `
    ).run(repository);

    db.prepare(`DELETE FROM journal_entries WHERE repository = ?`).run(repository);
  }

  if (existing) {
    db.prepare(`DELETE FROM repository_overviews WHERE repository = ?`).run(repository);
  }

  if (!existing && !deleteEntries) {
    return NextResponse.json(
      {
        success: false,
        error: `No Repository overview exists for "${repository}". Check "Also delete journal entries" to remove entries.`,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: deleteEntries
      ? `Deleted repository "${repository}" and ${entryCount.count} journal entries`
      : `Deleted Repository overview for "${repository}" (${entryCount.count} entries preserved)`,
    entries_deleted: deleteEntries ? entryCount.count : 0,
    summary_deleted: !!existing,
  });
});
