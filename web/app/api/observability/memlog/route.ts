import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { getDatabase } from "@/lib/db";

/**
 * Client memory-telemetry sink. Receives ring-buffer tails from
 * `web/lib/dev-memlog.ts` when the client crosses a warn/alert
 * threshold or is unloading after a breach. Stores them in
 * `client_memlog` so we can post-mortem a tab freeze even after
 * the tab dies.
 *
 * Dev-only: refuses writes in production to avoid storing telemetry
 * from real users by accident.
 */

interface MemSample {
  t: number;
  heap?: number;
  heapTotal?: number;
  heapLimit?: number;
  nodes?: number;
  ctx?: Record<string, unknown>;
}

interface MemlogBeaconPayload {
  sessionId?: string;
  trigger?: string;
  reason?: string;
  url?: string | null;
  userAgent?: string | null;
  sampleCount?: number;
  peakHeapMb?: number;
  peakNodes?: number;
  samples?: MemSample[];
}

const ALLOWED_TRIGGERS = new Set(["warn", "alert", "unload", "manual"]);
const MAX_SAMPLES = 240;
const MAX_BODY_BYTES = 256 * 1024; // 256KB — sendBeacon caps small anyway

function ensureMemlogTable(): void {
  const db = getDatabase();
  // received_at stores ISO 8601 UTC with explicit Z suffix so the
  // viewer can parse it without timezone-guess heuristics. SQLite's
  // bare datetime('now') returns local time with no offset marker,
  // which mismatches the page's parser — so we write it explicitly.
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_memlog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      received_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      trigger TEXT NOT NULL,
      user_agent TEXT,
      url TEXT,
      conversation_id INTEGER,
      sample_count INTEGER NOT NULL DEFAULT 0,
      peak_heap_mb INTEGER,
      peak_nodes INTEGER,
      samples_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_client_memlog_received_at
      ON client_memlog(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_memlog_session_id
      ON client_memlog(session_id);
    CREATE INDEX IF NOT EXISTS idx_client_memlog_conversation_id
      ON client_memlog(conversation_id);
  `);
}

function pickConversationId(samples: MemSample[]): number | null {
  // The most recent sample with a ctx.conversationId wins.
  for (let i = samples.length - 1; i >= 0; i--) {
    const v = samples[i]?.ctx?.conversationId;
    if (typeof v === "number") return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  return null;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, reason: "disabled in production" }, { status: 403 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, reason: "payload too large" }, { status: 413 });
  }

  let payload: MemlogBeaconPayload;
  try {
    payload = JSON.parse(raw) as MemlogBeaconPayload;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid JSON" }, { status: 400 });
  }

  const sessionId = typeof payload.sessionId === "string" && payload.sessionId.trim()
    ? payload.sessionId.trim()
    : "anon";
  const trigger = typeof payload.trigger === "string" && ALLOWED_TRIGGERS.has(payload.trigger)
    ? payload.trigger
    : "manual";
  const reason = typeof payload.reason === "string" ? payload.reason.slice(0, 500) : "(no reason)";
  const samples = Array.isArray(payload.samples) ? payload.samples.slice(-MAX_SAMPLES) : [];

  ensureMemlogTable();
  const db = getDatabase();
  const receivedAt = new Date().toISOString(); // explicit UTC with Z suffix
  const result = db.prepare(`
    INSERT INTO client_memlog
      (session_id, received_at, reason, trigger, user_agent, url, conversation_id,
       sample_count, peak_heap_mb, peak_nodes, samples_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    receivedAt,
    reason,
    trigger,
    typeof payload.userAgent === "string" ? payload.userAgent.slice(0, 500) : null,
    typeof payload.url === "string" ? payload.url.slice(0, 500) : null,
    pickConversationId(samples),
    samples.length,
    typeof payload.peakHeapMb === "number" ? Math.round(payload.peakHeapMb) : null,
    typeof payload.peakNodes === "number" ? Math.round(payload.peakNodes) : null,
    JSON.stringify(samples),
  );

  return NextResponse.json({ ok: true, id: result.lastInsertRowid });
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  ensureMemlogTable();
  const db = getDatabase();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);
  const sessionId = searchParams.get("session_id");
  const id = searchParams.get("id");

  // Single-breach fetch — full samples.
  if (id) {
    const row = db.prepare(`
      SELECT id, session_id as sessionId, received_at as receivedAt, reason, trigger,
             user_agent as userAgent, url, conversation_id as conversationId,
             sample_count as sampleCount, peak_heap_mb as peakHeapMb,
             peak_nodes as peakNodes, samples_json as samplesJson
      FROM client_memlog WHERE id = ?
    `).get(Number(id)) as
      | { samplesJson: string; [key: string]: unknown }
      | undefined;
    if (!row) return NextResponse.json({ ok: false }, { status: 404 });
    let samples: MemSample[] = [];
    try { samples = JSON.parse(row.samplesJson) as MemSample[]; } catch { /* ignore */ }
    const { samplesJson: _omit, ...rest } = row;
    void _omit;
    return NextResponse.json({ ok: true, breach: { ...rest, samples } });
  }

  // List view — metadata only, samples omitted to keep the page light.
  const rows = sessionId
    ? db.prepare(`
        SELECT id, session_id as sessionId, received_at as receivedAt, reason, trigger,
               user_agent as userAgent, url, conversation_id as conversationId,
               sample_count as sampleCount, peak_heap_mb as peakHeapMb,
               peak_nodes as peakNodes
        FROM client_memlog WHERE session_id = ?
        ORDER BY received_at DESC LIMIT ?
      `).all(sessionId, limit)
    : db.prepare(`
        SELECT id, session_id as sessionId, received_at as receivedAt, reason, trigger,
               user_agent as userAgent, url, conversation_id as conversationId,
               sample_count as sampleCount, peak_heap_mb as peakHeapMb,
               peak_nodes as peakNodes
        FROM client_memlog
        ORDER BY received_at DESC LIMIT ?
      `).all(limit);

  return NextResponse.json({ ok: true, breaches: rows, count: rows.length });
});
