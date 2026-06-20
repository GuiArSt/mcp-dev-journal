import { NextResponse } from "next/server";
import { getKronusContextMetrics } from "@/lib/kronus-context-metrics-store";

/**
 * GET /api/kronus/metrics
 * Label-keyed soul context metrics (cached in SQLite, recomputed when stale).
 * Pass ?refresh=1 to force recompute after sync or library edits.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";
    const { stats, sections, computedAt, cached } = await getKronusContextMetrics({ refresh });
    return NextResponse.json({
      sections,
      baseTokens: stats.baseTokens,
      totalTokens: stats.totalTokens,
      totalTokensWithCompleted: stats.totalTokensWithCompleted,
      totalTokensActive: stats.totalTokensActive,
      _meta: { computedAt, cached, source: "kronus_context_section_metrics" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load metrics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
