import { NextResponse } from "next/server";
import { getMe } from "@/lib/slite/client";
import { syncSliteData } from "@/lib/slite/sync";
import { getDrizzleDb, sliteNotes } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";

/**
 * Slite Sync API
 *
 * Syncs Slite notes to local database for caching and context injection.
 * Data is preserved even if deleted in Slite (soft delete).
 *
 * GET - Get sync status and cached data stats
 * POST - Sync data from Slite API to local database
 */

// GET - Sync status from cached database
export async function GET() {
  try {
    const db = getDrizzleDb();

    const [allNotes, activeNotes] = await Promise.all([
      db.select().from(sliteNotes),
      db.select().from(sliteNotes).where(eq(sliteNotes.isDeleted, false)),
    ]);

    const lastSync =
      allNotes.length > 0
        ? allNotes.sort(
            (a, b) =>
              new Date(b.syncedAt || 0).getTime() -
              new Date(a.syncedAt || 0).getTime()
          )[0]?.syncedAt
        : null;

    return NextResponse.json({
      status: "cached",
      lastSync,
      stats: {
        notes: {
          total: allNotes.length,
          active: activeNotes.length,
          deleted: allNotes.length - activeNotes.length,
        },
      },
    });
  } catch (error: any) {
    console.error("Slite sync status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get Slite sync status" },
      { status: 500 }
    );
  }
}

// POST - Sync from Slite API to local database
export async function POST() {
  try {
    // Validate Slite API connection first
    const me = await getMe();
    console.log(
      `[Slite Sync] Starting sync for: ${me.displayName} (${me.organizationName})`
    );

    const syncResult = await syncSliteData();

    console.log(`[Slite Sync] Completed:`, syncResult);

    const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
    markContextMetricsStale();

    return NextResponse.json({
      success: true,
      message: `Synced ${syncResult.notes.total} notes (${syncResult.notes.created} new, ${syncResult.notes.updated} updated)`,
      syncResult,
      lastSync: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Slite sync error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync Slite data" },
      { status: 500 }
    );
  }
}
