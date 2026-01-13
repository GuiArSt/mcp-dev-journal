import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { getRecentTraces, getTraceSpans, getTraceStats } from "@/lib/observability";

/**
 * GET /api/observability
 *
 * Get AI traces and stats for observability dashboard.
 *
 * Query params:
 * - trace_id: Get spans for a specific trace
 * - stats: Get aggregated stats (pass days=N for timeframe)
 * - limit: Number of recent traces to return (default 50)
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const traceId = searchParams.get("trace_id");
  const showStats = searchParams.get("stats");
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const days = parseInt(searchParams.get("days") ?? "7", 10);

  // Get specific trace
  if (traceId) {
    const spans = getTraceSpans(traceId);
    return NextResponse.json({ trace_id: traceId, spans });
  }

  // Get stats
  if (showStats !== null) {
    const stats = getTraceStats(days);
    return NextResponse.json({ stats, days });
  }

  // Get recent traces
  const traces = getRecentTraces(limit);
  return NextResponse.json({ traces, count: traces.length });
});
