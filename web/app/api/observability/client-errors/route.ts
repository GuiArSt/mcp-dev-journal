import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { getDatabase } from "@/lib/db";

/**
 * Client JS error sink — uncaught exceptions and unhandled rejections
 * from `web/lib/dev-client-errors.ts`. Dev-only.
 */

interface MemSample {
  t: number;
  heap?: number;
  nodes?: number;
  ctx?: Record<string, unknown>;
}

interface ClientErrorPayload {
  sessionId?: string;
  kind?: string;
  message?: string;
  stack?: string | null;
  source?: string | null;
  lineno?: number | null;
  colno?: number | null;
  url?: string | null;
  userAgent?: string | null;
  conversationId?: number | null;
  context?: Record<string, unknown>;
  memTail?: MemSample[];
}

const ALLOWED_KINDS = new Set(["error", "unhandledrejection"]);
const MAX_BODY_BYTES = 128 * 1024;

function ensureTable(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS client_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      received_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      source TEXT,
      lineno INTEGER,
      colno INTEGER,
      url TEXT,
      user_agent TEXT,
      conversation_id INTEGER,
      context_json TEXT,
      mem_tail_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_client_errors_received_at
      ON client_errors(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_client_errors_session_id
      ON client_errors(session_id);
    CREATE INDEX IF NOT EXISTS idx_client_errors_conversation_id
      ON client_errors(conversation_id);
  `);
}

function pickConversationId(payload: ClientErrorPayload): number | null {
  if (typeof payload.conversationId === "number") return payload.conversationId;
  const fromCtx = payload.context?.conversationId;
  if (typeof fromCtx === "number") return fromCtx;
  if (typeof fromCtx === "string" && /^\d+$/.test(fromCtx)) return Number(fromCtx);
  for (let i = (payload.memTail?.length ?? 0) - 1; i >= 0; i--) {
    const v = payload.memTail?.[i]?.ctx?.conversationId;
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

  let payload: ClientErrorPayload;
  try {
    payload = JSON.parse(raw) as ClientErrorPayload;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid JSON" }, { status: 400 });
  }

  const sessionId =
    typeof payload.sessionId === "string" && payload.sessionId.trim()
      ? payload.sessionId.trim()
      : "anon";
  const kind =
    typeof payload.kind === "string" && ALLOWED_KINDS.has(payload.kind)
      ? payload.kind
      : "error";
  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim().slice(0, 4000)
      : "(no message)";

  ensureTable();
  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO client_errors
        (session_id, received_at, kind, message, stack, source, lineno, colno,
         url, user_agent, conversation_id, context_json, mem_tail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sessionId,
      new Date().toISOString(),
      kind,
      message,
      typeof payload.stack === "string" ? payload.stack.slice(0, 16_000) : null,
      typeof payload.source === "string" ? payload.source.slice(0, 500) : null,
      typeof payload.lineno === "number" ? payload.lineno : null,
      typeof payload.colno === "number" ? payload.colno : null,
      typeof payload.url === "string" ? payload.url.slice(0, 500) : null,
      typeof payload.userAgent === "string" ? payload.userAgent.slice(0, 500) : null,
      pickConversationId(payload),
      payload.context ? JSON.stringify(payload.context).slice(0, 8000) : null,
      payload.memTail ? JSON.stringify(payload.memTail).slice(0, 32_000) : null,
    );

  return NextResponse.json({ ok: true, id: result.lastInsertRowid });
});

export const GET = withErrorHandler(async (request: NextRequest) => {
  ensureTable();
  const db = getDatabase();
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);
  const id = searchParams.get("id");

  if (id) {
    const row = db
      .prepare(
        `SELECT id, session_id as sessionId, received_at as receivedAt, kind, message,
                stack, source, lineno, colno, url, user_agent as userAgent,
                conversation_id as conversationId, context_json as contextJson,
                mem_tail_json as memTailJson
         FROM client_errors WHERE id = ?`,
      )
      .get(Number(id)) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ ok: false }, { status: 404 });
    let context: Record<string, unknown> | null = null;
    let memTail: MemSample[] = [];
    try {
      if (typeof row.contextJson === "string") context = JSON.parse(row.contextJson);
    } catch { /* ignore */ }
    try {
      if (typeof row.memTailJson === "string") memTail = JSON.parse(row.memTailJson);
    } catch { /* ignore */ }
    const { contextJson: _c, memTailJson: _m, ...rest } = row;
    void _c;
    void _m;
    return NextResponse.json({ ok: true, error: { ...rest, context, memTail } });
  }

  const rows = db
    .prepare(
      `SELECT id, session_id as sessionId, received_at as receivedAt, kind, message,
              source, lineno, url, conversation_id as conversationId
       FROM client_errors ORDER BY received_at DESC LIMIT ?`,
    )
    .all(limit);

  return NextResponse.json({ ok: true, errors: rows, count: rows.length });
});
