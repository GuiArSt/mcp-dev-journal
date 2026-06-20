import { NextResponse } from "next/server";
import { getMe } from "@/lib/notion/client";
import { syncNotionData } from "@/lib/notion/sync";
import { getDrizzleDb, notionPages } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";

/**
 * Notion Sync API
 *
 * Syncs Notion pages to local database for caching and context injection.
 * Data is preserved even if deleted/archived in Notion (soft delete).
 *
 * GET - Get sync status and cached data stats
 * POST - Sync data from Notion API to local database
 */

// GET - Sync status from cached database
export async function GET() {
  try {
    const db = getDrizzleDb();

    const [allPages, activePages] = await Promise.all([
      db.select().from(notionPages),
      db.select().from(notionPages).where(eq(notionPages.isDeleted, false)),
    ]);

    const lastSync =
      allPages.length > 0
        ? allPages.sort(
            (a, b) =>
              new Date(b.syncedAt || 0).getTime() -
              new Date(a.syncedAt || 0).getTime()
          )[0]?.syncedAt
        : null;

    return NextResponse.json({
      status: "cached",
      lastSync,
      stats: {
        pages: {
          total: allPages.length,
          active: activePages.length,
          deleted: allPages.length - activePages.length,
        },
      },
    });
  } catch (error: any) {
    console.error("Notion sync status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get Notion sync status" },
      { status: 500 }
    );
  }
}

// POST - Sync from Notion API to local database
export async function POST() {
  try {
    // Validate Notion API connection first
    const me = await getMe();
    console.log(`[Notion Sync] Starting sync for: ${me.name}`);

    const syncResult = await syncNotionData();

    console.log(`[Notion Sync] Completed:`, syncResult);

    const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
    markContextMetricsStale();

    return NextResponse.json({
      success: true,
      message: `Synced ${syncResult.pages.total} pages (${syncResult.pages.created} new, ${syncResult.pages.updated} updated)`,
      syncResult,
      lastSync: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Notion sync error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync Notion data" },
      { status: 500 }
    );
  }
}
