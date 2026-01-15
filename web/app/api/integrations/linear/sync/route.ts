import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/linear/client";
import { syncLinearData } from "@/lib/linear/sync";
import { getDrizzleDb, linearProjects, linearIssues } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";

/**
 * Linear Sync API
 *
 * Syncs Linear Projects and Issues to local database for caching and historical preservation.
 * Data is preserved even if deleted in Linear (soft delete with deleted_at timestamp).
 *
 * GET - Get sync status and cached data stats
 * POST - Sync data from Linear API to local database
 */

// GET - Get sync status from cached database
export async function GET() {
  try {
    const db = getDrizzleDb();
    
    // Get stats from cached database
    const [allProjects, activeProjects, allIssues, activeIssues] = await Promise.all([
      db.select().from(linearProjects),
      db.select().from(linearProjects).where(eq(linearProjects.isDeleted, false)),
      db.select().from(linearIssues),
      db.select().from(linearIssues).where(eq(linearIssues.isDeleted, false)),
    ]);
    
    // Get last sync time (most recent synced_at)
    const lastProjectSync = allProjects.length > 0
      ? allProjects.sort((a, b) => 
          new Date(b.syncedAt || 0).getTime() - new Date(a.syncedAt || 0).getTime()
        )[0]?.syncedAt
      : null;
    
    const lastIssueSync = allIssues.length > 0
      ? allIssues.sort((a, b) => 
          new Date(b.syncedAt || 0).getTime() - new Date(a.syncedAt || 0).getTime()
        )[0]?.syncedAt
      : null;
    
    const lastSync = lastProjectSync && lastIssueSync
      ? new Date(Math.max(
          new Date(lastProjectSync).getTime(),
          new Date(lastIssueSync).getTime()
        )).toISOString()
      : lastProjectSync || lastIssueSync || null;

    return NextResponse.json({
      status: "cached", // Using cached database
      lastSync,
      lastError: null,
      stats: {
        projects: {
          total: allProjects.length,
          active: activeProjects.length,
          deleted: allProjects.length - activeProjects.length,
        },
        issues: {
          total: allIssues.length,
          active: activeIssues.length,
          deleted: allIssues.length - activeIssues.length,
        },
      },
    });
  } catch (error: any) {
    console.error("Linear sync status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get Linear sync status" },
      { status: 500 }
    );
  }
}

// POST - Sync data from Linear API to local database
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { includeCompleted = false } = body;

    // Validate Linear API connection first
    const viewer = await getViewer();
    console.log(`[Linear Sync] Starting sync for user: ${viewer.name}`);

    // Sync data to database
    const syncResult = await syncLinearData(includeCompleted);

    console.log(`[Linear Sync] Completed:`, syncResult);

    return NextResponse.json({
      success: true,
      message: `Synced ${syncResult.projects.created + syncResult.projects.updated} projects and ${syncResult.issues.created + syncResult.issues.updated} issues`,
      syncResult,
      lastSync: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Linear sync error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync Linear data" },
      { status: 500 }
    );
  }
}
