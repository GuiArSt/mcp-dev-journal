import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";

/**
 * GET /api/repositories
 *
 * List all distinct repositories with journal entries.
 */
export const GET = withErrorHandler(async () => {
  const db = getDatabase();
  const repositories = db
    .prepare("SELECT DISTINCT repository FROM journal_entries ORDER BY repository ASC")
    .all() as Array<{ repository: string }>;

  return NextResponse.json(repositories.map((r) => r.repository));
});










