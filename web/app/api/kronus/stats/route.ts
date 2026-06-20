import { NextResponse } from "next/server";
import { getAgentConfig } from "@/lib/ai/kronus";
import { buildKronusLiteSummaryIndex } from "@/lib/ai/kronus-lite";
import { getKronusContextMetrics } from "@/lib/kronus-context-metrics-store";

/**
 * GET /api/kronus/stats
 * Back-compat alias for /api/kronus/metrics (cached section metrics).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";
    const { stats, computedAt, cached } = await getKronusContextMetrics({ refresh });
    const lite = await buildKronusLiteSummaryIndex();
    return NextResponse.json({
      ...stats,
      liteIndexTokens: lite.tokenEstimate,
      _meta: { computedAt, cached },
    });
  } catch (error: unknown) {
    const agentConfig = getAgentConfig();
    const message = error instanceof Error ? error.message : "Failed to fetch stats";
    console.error(`Failed to fetch ${agentConfig.name} stats:`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
