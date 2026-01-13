import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";

/**
 * GET /api/project-summaries
 *
 * List all project summaries with entry counts.
 * Includes repositories that have journal entries but no project summary yet.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();

  // Get all unique repositories from both tables
  // This ensures we show repos with entries even if they don't have a project summary
  const summaries = db
    .prepare(`
      WITH all_repos AS (
        -- Repos from project_summaries
        SELECT repository FROM project_summaries
        UNION
        -- Repos from journal_entries that might not have a summary
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
      LEFT JOIN project_summaries ps ON ps.repository = ar.repository
      ORDER BY
        (SELECT MAX(date) FROM journal_entries je WHERE je.repository = ar.repository) DESC NULLS LAST,
        ps.updated_at DESC
    `)
    .all();

  return NextResponse.json({
    summaries,
    total: summaries.length,
  });
});
