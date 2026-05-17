import { NextRequest, NextResponse } from "next/server";
import { getActiveRequests, cancelRequest, cancelAll } from "@/lib/request-registry";
import { getDatabase } from "@/lib/db";
import { ensureTracesTable } from "@/lib/observability";

function getRecentRunningTraces() {
  try {
    const db = getDatabase();
    ensureTracesTable();
    return db
      .prepare(
        `SELECT id, trace_id, name, model, status, started_at, metadata
         FROM ai_traces
         WHERE status = 'running' AND parent_span_id IS NULL
         ORDER BY started_at DESC
         LIMIT 20`
      )
      .all() as Array<{
      id: string;
      trace_id: string;
      name: string;
      model: string | null;
      status: string;
      started_at: string;
      metadata: string | null;
    }>;
  } catch {
    return [];
  }
}

/**
 * GET /api/monitor
 * Returns active in-flight requests (registry) plus any orphaned DB running rows.
 */
export async function GET() {
  const active = getActiveRequests();
  const dbRunning = getRecentRunningTraces();

  // Enrich registry entries with elapsed time
  const now = Date.now();
  const enriched = active.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    elapsedMs: now - r.startedAt.getTime(),
  }));

  return NextResponse.json({ active: enriched, dbRunning, count: enriched.length });
}

/**
 * DELETE /api/monitor?id=xxx  — cancel a single request
 * DELETE /api/monitor?all=true — cancel everything
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const all = searchParams.get("all");

  if (all === "true") {
    const cancelled = cancelAll();
    return NextResponse.json({ cancelled, count: cancelled.length });
  }

  if (!id) return NextResponse.json({ error: "id or all=true required" }, { status: 400 });

  const ok = cancelRequest(id);
  if (!ok) return NextResponse.json({ error: "request not found" }, { status: 404 });
  return NextResponse.json({ cancelled: id });
}
