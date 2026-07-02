import { AsyncLocalStorage } from "async_hooks";
import { getDatabase } from "./db";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TraceSpan {
  id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  type: "generation" | "span" | "event";
  model?: string;
  endpoint?: string;
  input?: unknown;
  output?: unknown;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  latency_ms?: number;
  cost_usd?: number;
  status: "running" | "success" | "error";
  error_message?: string;
  metadata?: Record<string, unknown>;
  started_at: string;
  ended_at?: string;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
}

// ─── Cost table (per 1M tokens) ──────────────────────────────────────────────

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20250514": { input: 0.8, output: 4.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
  "claude-opus-4-5-20251101": { input: 15.0, output: 75.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-fable-5": { input: 10.0, output: 50.0 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  // OpenAI
  "gpt-5.4": { input: 2.5, output: 15.0 },
  "gpt-5.5": { input: 5.0, output: 30.0 },
  "gpt-image-2": { input: 0, output: 0 }, // image priced per-image, not per-token
  // Google Gemini
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3-pro": { input: 1.25, output: 5.0 },
  "gemini-3-pro-image-preview": { input: 0, output: 0 },
  "gemini-3-flash": { input: 0.075, output: 0.30 },
  "gemini-3-flash-preview": { input: 0.075, output: 0.30 },
  "gemini-3.1-pro-preview": { input: 1.25, output: 5.0 },
  "gemini-3.1-flash-image-preview": { input: 0, output: 0 },
  "gemini-3.1-flash-lite-preview": { input: 0.038, output: 0.15 },
  "gemini-2.5-flash": { input: 0.075, output: 0.30 },
  "gemini-2.5-flash-image": { input: 0, output: 0 },
};

function calculateCost(model: string, input: number, output: number): number {
  const c = MODEL_COSTS[model];
  if (!c) return 0;
  if ((model === "gpt-5.4" || model === "gpt-5.5") && input > 272_000) {
    return (input * c.input * 2 + output * c.output * 1.5) / 1_000_000;
  }
  return (input * c.input + output * c.output) / 1_000_000;
}

// ─── Internals ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// Per-request context stored in AsyncLocalStorage — safe under concurrent requests.
const traceStore = new AsyncLocalStorage<{ traceId: string; parentSpanId: string; conversationId?: number }>();

export function ensureTracesTable(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_traces (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      parent_span_id TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'span',
      model TEXT,
      input TEXT,
      output TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      latency_ms INTEGER,
      cost_usd REAL,
      status TEXT NOT NULL DEFAULT 'running',
      error_message TEXT,
      metadata TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_traces_trace_id ON ai_traces(trace_id);
    CREATE INDEX IF NOT EXISTS idx_ai_traces_started_at ON ai_traces(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_traces_name ON ai_traces(name);
  `);

  // Soft migration: add endpoint column to existing installs (idempotent).
  try {
    db.exec(`ALTER TABLE ai_traces ADD COLUMN endpoint TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_traces_endpoint ON ai_traces(endpoint)`);
  } catch { /* ignore */ }

  // Soft migration: conversation_id ties this trace to a chat_conversations row.
  // Lets us aggregate "cost of this chat" with one indexed query.
  try {
    db.exec(`ALTER TABLE ai_traces ADD COLUMN conversation_id INTEGER`);
  } catch { /* column already exists */ }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_traces_conversation_id ON ai_traces(conversation_id)`);
  } catch { /* ignore */ }
}

// Track span start times in-process so latency uses monotonic epoch ms,
// not SQLite's `datetime('now')` text (which caused a tz-mismatch bug).
const spanStartedAt = new Map<string, number>();

function insertSpan(row: {
  id: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  type: string;
  model?: string;
  metadata?: Record<string, unknown>;
  input?: unknown;
  endpoint?: string | null;
  /** When set, ties this trace span to a chat_conversations row.
   *  Falls back to the AsyncLocalStorage context when omitted, so any
   *  span created inside a `withTrace({ conversationId })` block is
   *  automatically tagged. */
  conversationId?: number | null;
}): void {
  const db = getDatabase();
  const nowMs = Date.now();
  spanStartedAt.set(row.id, nowMs);
  // Store started_at as ISO 8601 with explicit Z so clients parse correctly.
  const iso = new Date(nowMs).toISOString();
  // Inherit conversationId from the trace context if not explicitly supplied.
  const conversationId =
    row.conversationId ?? traceStore.getStore()?.conversationId ?? null;
  db.prepare(
    `INSERT INTO ai_traces (id, trace_id, parent_span_id, name, type, model, status, metadata, input, endpoint, conversation_id, started_at)
     VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.traceId,
    row.parentSpanId,
    row.name,
    row.type,
    row.model ?? null,
    row.metadata ? JSON.stringify(row.metadata) : null,
    row.input != null ? truncateForStorage(row.input) : null,
    row.endpoint ?? null,
    conversationId,
    iso
  );
}

/** Cap stored input/output at ~8KB to keep the trace table small. */
function truncateForStorage(v: unknown): string {
  let s: string;
  if (typeof v === "string") s = v;
  else { try { s = JSON.stringify(v); } catch { s = String(v); } }
  const MAX = 8000;
  return s.length > MAX ? s.slice(0, MAX) + `… [truncated, ${s.length} total chars]` : s;
}

function completeSpan(
  spanId: string,
  usage?: { inputTokens?: number; outputTokens?: number },
  error?: unknown,
  output?: unknown,
): void {
  const db = getDatabase();
  const row = db.prepare("SELECT model FROM ai_traces WHERE id = ?").get(spanId) as
    | { model: string | null }
    | undefined;
  if (!row) return;

  // Use the in-memory start time we recorded at insert; immune to SQLite tz weirdness.
  const startedAtMs = spanStartedAt.get(spanId);
  const endMs = Date.now();
  const latencyMs = startedAtMs != null ? endMs - startedAtMs : 0;
  spanStartedAt.delete(spanId);

  const endedIso = new Date(endMs).toISOString();
  const inp = usage?.inputTokens ?? 0;
  const out = usage?.outputTokens ?? 0;
  const cost = calculateCost(row.model ?? "", inp, out);
  const outputText = output != null ? truncateForStorage(output) : null;

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    db.prepare(
      `UPDATE ai_traces SET status='error', error_message=?, latency_ms=?, ended_at=?, output=? WHERE id=?`
    ).run(msg, latencyMs, endedIso, outputText, spanId);
    console.log(`[AI Trace] ERROR span=${spanId} ${latencyMs}ms "${msg}"`);
  } else {
    db.prepare(
      `UPDATE ai_traces SET status='success', input_tokens=?, output_tokens=?, total_tokens=?,
       latency_ms=?, cost_usd=?, ended_at=?, output=? WHERE id=?`
    ).run(inp || null, out || null, (inp + out) || null, latencyMs, cost || null, endedIso, outputText, spanId);
    console.log(
      `[AI Trace] END span=${spanId} ${latencyMs}ms tokens=${inp}/${out} cost=$${cost.toFixed(4)}`
    );
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Wrap multiple AI calls under one parent trace.
 * Each traceAI() inside fn() will share the same trace_id.
 *
 * Pass `conversationId` to tag every span inside this trace with the
 * chat_conversations row — used by the per-chat cost meter.
 */
export async function withTrace<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
  endpoint?: string,
  conversationId?: number,
): Promise<T> {
  ensureTracesTable();
  const traceId = generateId();
  const spanId = generateId();
  insertSpan({ id: spanId, traceId, parentSpanId: null, name, type: "span", metadata, endpoint, conversationId });
  console.log(`[AI Trace] TRACE START ${name} endpoint=${endpoint ?? "—"} trace=${traceId}${conversationId ? ` chat=${conversationId}` : ""}`);

  const db = getDatabase();
  try {
    const result = await traceStore.run({ traceId, parentSpanId: spanId, conversationId }, fn);
    const totals = db
      .prepare(
        `SELECT SUM(cost_usd) as c, SUM(input_tokens) as i, SUM(output_tokens) as o
         FROM ai_traces WHERE trace_id = ? AND parent_span_id = ?`
      )
      .get(traceId, spanId) as { c: number | null; i: number | null; o: number | null };
    completeSpan(spanId, { inputTokens: totals.i ?? 0, outputTokens: totals.o ?? 0 });
    // Recompute the conversation's running cost after the trace closes.
    if (conversationId) recomputeConversationCost(conversationId);
    return result;
  } catch (err) {
    completeSpan(spanId, undefined, err);
    if (conversationId) recomputeConversationCost(conversationId);
    throw err;
  }
}

/**
 * Wrap a single non-streaming AI call (generateText / generateObject).
 * Creates its own trace when called standalone; becomes a child when inside withTrace().
 */
export async function traceAI<
  T extends { usage?: { inputTokens?: number; outputTokens?: number } },
>(
  name: string,
  modelId: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>,
  input?: unknown,
  endpoint?: string,
  conversationId?: number,
): Promise<T> {
  ensureTracesTable();
  const ctx = traceStore.getStore();
  const traceId = ctx?.traceId ?? generateId();
  const spanId = generateId();
  // Resolve conversationId: explicit > metadata.conversationId > store.
  const resolvedConvId =
    conversationId
    ?? (typeof (metadata as { conversationId?: unknown } | undefined)?.conversationId === "number"
      ? ((metadata as { conversationId: number }).conversationId)
      : undefined)
    ?? ctx?.conversationId;

  insertSpan({
    id: spanId,
    traceId,
    parentSpanId: ctx?.parentSpanId ?? null,
    name,
    type: "generation",
    model: modelId,
    metadata,
    input,
    endpoint,
    conversationId: resolvedConvId,
  });
  console.log(`[AI Trace] START ${name} model=${modelId} trace=${traceId}${resolvedConvId ? ` chat=${resolvedConvId}` : ""}`);

  try {
    const result = await fn();
    // Try to capture the textual output; AI SDK shapes vary so we fall back gracefully.
    const r = result as unknown as { text?: string; output?: unknown; object?: unknown };
    const captured = r.text ?? r.output ?? r.object ?? null;
    completeSpan(spanId, result.usage, undefined, captured);
    if (resolvedConvId) recomputeConversationCost(resolvedConvId);
    return result;
  } catch (err) {
    completeSpan(spanId, undefined, err);
    if (resolvedConvId) recomputeConversationCost(resolvedConvId);
    throw err;
  }
}

/**
 * Open a generation span for streaming routes.
 * Call closeAISpan() from onFinish with the returned spanId.
 */
export function openAISpan(
  name: string,
  modelId: string,
  metadata?: Record<string, unknown>,
  input?: unknown,
  endpoint?: string,
  conversationId?: number,
): string {
  ensureTracesTable();
  const ctx = traceStore.getStore();
  const traceId = ctx?.traceId ?? generateId();
  const spanId = generateId();
  insertSpan({
    id: spanId,
    traceId,
    parentSpanId: ctx?.parentSpanId ?? null,
    conversationId,
    name,
    type: "generation",
    model: modelId,
    metadata,
    input,
    endpoint,
  });
  console.log(`[AI Trace] START ${name} model=${modelId} trace=${traceId}`);
  return spanId;
}

export function closeAISpan(
  spanId: string,
  usage?: { inputTokens?: number; outputTokens?: number },
  error?: unknown,
  output?: unknown,
): void {
  completeSpan(spanId, usage, error, output);
  // Recompute the chat's cost meter after this span closes.
  try {
    const db = getDatabase();
    const row = db
      .prepare("SELECT conversation_id FROM ai_traces WHERE id = ?")
      .get(spanId) as { conversation_id: number | null } | undefined;
    if (row?.conversation_id) recomputeConversationCost(row.conversation_id);
  } catch { /* non-critical */ }
}

// ─── Per-conversation aggregation ────────────────────────────────────────────

/**
 * Recompute and persist the running cost for a chat conversation by
 * summing every successful trace tagged with this conversation_id.
 *
 * Writes to chat_conversations.cost_usd / actual_input_tokens /
 * actual_output_tokens. Called automatically at the end of withTrace()
 * when conversationId is set; can also be called explicitly by image
 * paint paths via recordImageCost().
 */
export function recomputeConversationCost(conversationId: number): void {
  if (!conversationId) return;
  const db = getDatabase();
  ensureTracesTable();
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(cost_usd), 0) AS cost,
         COALESCE(SUM(input_tokens), 0) AS inp,
         COALESCE(SUM(output_tokens), 0) AS out
       FROM ai_traces
       WHERE conversation_id = ? AND status = 'success'`
    )
    .get(conversationId) as { cost: number; inp: number; out: number };

  try {
    db.prepare(
      `UPDATE chat_conversations
         SET cost_usd = ?, actual_input_tokens = ?, actual_output_tokens = ?
       WHERE id = ?`
    ).run(totals.cost || 0, totals.inp || 0, totals.out || 0, conversationId);
  } catch {
    /* table or columns may not exist yet — migration runs lazily on
       first conversation save; ignore. */
  }
}

/** Per-image fixed-cost rates (USD). Image paints are not token-based;
 *  these are flat per-render costs aligned with the providers' pricing. */
const IMAGE_COSTS: Record<string, number> = {
  // OpenAI GPT Image 2 — varies by quality
  "gpt-image-2:low": 0.04,
  "gpt-image-2:medium": 0.07,
  "gpt-image-2:high": 0.19,
  "gpt-image-2": 0.07, // default = medium
  // Google Gemini image models
  "nano-banana-2": 0.04,
  "nano-banana-pro": 0.10,
  "nano-banana": 0.04, // legacy alias → same as nano-banana-2
};

/**
 * Record a fixed image-generation cost as a synthetic trace row so the
 * per-conversation cost meter sees it. Returns the cost (USD).
 */
export function recordImageCost(opts: {
  model: string;
  quality?: "low" | "medium" | "high";
  conversationId?: number;
  endpoint?: string;
  /** Distinguish image-to-image vs text-to-image in trace metadata. */
  operation?: "generate" | "edit";
}): number {
  ensureTracesTable();
  const lookupKey =
    opts.quality && opts.model === "gpt-image-2"
      ? `${opts.model}:${opts.quality}`
      : opts.model;
  const cost = IMAGE_COSTS[lookupKey] ?? IMAGE_COSTS[opts.model] ?? 0;
  if (!cost) return 0;

  const db = getDatabase();
  const ctx = traceStore.getStore();
  const traceId = ctx?.traceId ?? generateId();
  const spanId = generateId();
  const conversationId = opts.conversationId ?? ctx?.conversationId ?? null;
  const nowIso = new Date().toISOString();
  // Synthetic span: not a generation but a cost event. Status=success so
  // recomputeConversationCost picks it up.
  db.prepare(
    `INSERT INTO ai_traces (id, trace_id, parent_span_id, name, type, model, status,
                            cost_usd, latency_ms, input_tokens, output_tokens,
                            metadata, endpoint, conversation_id, started_at, ended_at)
     VALUES (?, ?, ?, ?, 'image', ?, 'success', ?, 0, 0, 0, ?, ?, ?, ?, ?)`
  ).run(
    spanId,
    traceId,
    ctx?.parentSpanId ?? null,
    `image:${opts.model}${opts.quality ? `:${opts.quality}` : ""}`,
    opts.model,
    cost,
    JSON.stringify({ quality: opts.quality, operation: opts.operation ?? "generate" }),
    opts.endpoint ?? null,
    conversationId,
    nowIso,
    nowIso,
  );

  if (conversationId) recomputeConversationCost(conversationId);
  return cost;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function getRecentTraces(limit = 50): TraceSpan[] {
  const db = getDatabase();
  ensureTracesTable();
  return db
    .prepare(
      "SELECT * FROM ai_traces WHERE parent_span_id IS NULL ORDER BY started_at DESC LIMIT ?"
    )
    .all(limit) as TraceSpan[];
}

export function getTraceSpans(traceId: string): TraceSpan[] {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM ai_traces WHERE trace_id = ? ORDER BY started_at ASC")
    .all(traceId) as TraceSpan[];
}

export function getRecentRunningTraces(limit = 20): TraceSpan[] {
  const db = getDatabase();
  ensureTracesTable();
  return db
    .prepare(
      "SELECT * FROM ai_traces WHERE status = 'running' ORDER BY started_at DESC LIMIT ?"
    )
    .all(limit) as TraceSpan[];
}

export function getTraceStats(days = 7): {
  total_traces: number;
  total_tokens: number;
  total_cost: number;
  avg_latency_ms: number;
  error_rate: number;
  by_model: Record<string, { count: number; tokens: number; cost: number }>;
} {
  const db = getDatabase();
  ensureTracesTable();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const stats = db
    .prepare(
      `SELECT
        COUNT(DISTINCT trace_id) as total_traces,
        SUM(CASE WHEN type = 'generation' THEN total_tokens ELSE 0 END) as total_tokens,
        SUM(CASE WHEN type = 'generation' THEN cost_usd ELSE 0 END) as total_cost,
        AVG(CASE WHEN parent_span_id IS NULL THEN latency_ms END) as avg_latency_ms,
        AVG(CASE WHEN status = 'error' THEN 1.0 ELSE 0.0 END) as error_rate
      FROM ai_traces WHERE started_at >= ?`
    )
    .get(cutoff.toISOString()) as {
    total_traces: number;
    total_tokens: number;
    total_cost: number;
    avg_latency_ms: number;
    error_rate: number;
  };

  const byModel = db
    .prepare(
      `SELECT model, COUNT(*) as count, SUM(total_tokens) as tokens, SUM(cost_usd) as cost
       FROM ai_traces WHERE started_at >= ? AND model IS NOT NULL GROUP BY model`
    )
    .all(cutoff.toISOString()) as Array<{ model: string; count: number; tokens: number; cost: number }>;

  return {
    ...stats,
    by_model: Object.fromEntries(
      byModel.map((m) => [m.model, { count: m.count, tokens: m.tokens, cost: m.cost }])
    ),
  };
}
