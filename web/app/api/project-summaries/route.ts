import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET() {
  try {
    const db = getDatabase();

    // Get project summaries with entry counts
    const summaries = db
      .prepare(`
        SELECT
          ps.*,
          (SELECT COUNT(*) FROM journal_entries je WHERE je.repository = ps.repository) as entry_count,
          (SELECT MAX(date) FROM journal_entries je WHERE je.repository = ps.repository) as last_entry_date
        FROM project_summaries ps
        ORDER BY ps.updated_at DESC
      `)
      .all();

    return NextResponse.json({
      summaries,
      total: summaries.length,
    });
  } catch (error) {
    console.error("Error fetching project summaries:", error);
    return NextResponse.json({ error: "Failed to fetch project summaries", summaries: [] }, { status: 500 });
  }
}
