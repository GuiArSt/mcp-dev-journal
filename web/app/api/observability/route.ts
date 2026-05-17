import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { getRecentTraces, getTraceSpans, getTraceStats, type TraceSpan } from "@/lib/observability";

/**
 * GET /api/observability
 *
 * Get AI traces and stats for observability dashboard.
 *
 * Query params:
 * - trace_id: Get spans for a specific trace
 * - stats: Get aggregated stats (pass days=N for timeframe)
 * - limit: Number of recent traces to return (default 50)
 * - bundle=true: For each parent trace, also include children spans + roll-up stats
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const traceId = searchParams.get("trace_id");
  const showStats = searchParams.get("stats");
  const bundle = searchParams.get("bundle") === "true";
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const days = parseInt(searchParams.get("days") ?? "7", 10);

  if (traceId) {
    const spans = getTraceSpans(traceId);
    return NextResponse.json({ trace_id: traceId, spans });
  }

  if (showStats !== null) {
    const stats = getTraceStats(days);
    return NextResponse.json({ stats, days });
  }

  const parents = getRecentTraces(limit);

  if (!bundle) {
    return NextResponse.json({ traces: parents, count: parents.length });
  }

  // Bundle: for each parent, attach child spans + aggregate stats
  type Bundled = TraceSpan & {
    children: TraceSpan[];
    rollup: {
      models: string[];
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
      step_count: number;
    };
  };
  const bundled: Bundled[] = [];
  for (const parent of parents) {
    const allSpans = getTraceSpans(parent.trace_id);
    const children = allSpans.filter((s) => s.id !== parent.id);

    const models = Array.from(new Set(children.map((c) => c.model).filter((m): m is string => !!m)));
    const sum = (k: keyof TraceSpan) =>
      children.reduce((acc, c) => acc + ((c[k] as number | undefined) ?? 0), 0);

    bundled.push({
      ...parent,
      children,
      rollup: {
        models,
        input_tokens: sum("input_tokens"),
        output_tokens: sum("output_tokens"),
        cost_usd: sum("cost_usd"),
        step_count: children.length,
      },
    });
  }

  return NextResponse.json({ traces: bundled, count: bundled.length });
});
