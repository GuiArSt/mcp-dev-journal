/**
 * Observability - Lightweight self-hosted tracing for AI calls
 *
 * Tracks:
 * - AI model calls (input/output tokens, latency, cost)
 * - Trace hierarchy (parent-child spans)
 * - Errors and retries
 *
 * Storage: SQLite table `ai_traces`
 * Logging: Console output for real-time visibility
 */

import { getDatabase } from "./db";

// ============================================================================
// Logging
// ============================================================================

const LOG_PREFIX = "[AI Trace]";

function logSpanStart(name: string, spanId: string, traceId: string, model?: string) {
  const modelInfo = model ? ` model=${model}` : "";
  console.log(`${LOG_PREFIX} START ${name} span=${spanId} trace=${traceId}${modelInfo}`);
}

function logSpanEnd(
  name: string,
  spanId: string,
  latencyMs: number,
  tokens?: { input?: number; output?: number },
  cost?: number,
  error?: string
) {
  const status = error ? "ERROR" : "OK";
  const tokenInfo = tokens?.input || tokens?.output
    ? ` tokens=${tokens.input ?? 0}/${tokens.output ?? 0}`
    : "";
  const costInfo = cost ? ` cost=$${cost.toFixed(4)}` : "";
  const errorInfo = error ? ` error="${error}"` : "";
  console.log(
    `${LOG_PREFIX} END ${name} span=${spanId} ${status} latency=${latencyMs}ms${tokenInfo}${costInfo}${errorInfo}`
  );
}

function logTraceStart(name: string, traceId: string) {
  console.log(`\n${LOG_PREFIX} ========== TRACE START: ${name} ==========`);
  console.log(`${LOG_PREFIX} trace_id=${traceId}`);
}

function logTraceEnd(latencyMs: number, totalCost?: number, error?: string) {
  const status = error ? "ERROR" : "OK";
  const costInfo = totalCost ? ` total_cost=$${totalCost.toFixed(4)}` : "";
  const errorInfo = error ? ` error="${error}"` : "";
  console.log(`${LOG_PREFIX} ========== TRACE END: ${status} latency=${latencyMs}ms${costInfo}${errorInfo} ==========\n`);
}

// ============================================================================
// Types
// ============================================================================

export interface TraceSpan {
  id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  type: "generation" | "span" | "event";
  model?: string;
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

// ============================================================================
// Cost calculation (per 1M tokens)
// ============================================================================

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20250514": { input: 0.8, output: 4.0 },
  "claude-opus-4-5-20251101": { input: 15.0, output: 75.0 },
};

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

// ============================================================================
// ID Generation
// ============================================================================

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// Database Schema
// ============================================================================

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
}

// ============================================================================
// Trace Management
// ============================================================================

let currentContext: TraceContext | null = null;

/**
 * Start a new trace (top-level operation)
 */
export function startTrace(name: string): TraceContext {
  ensureTracesTable();
  const traceId = generateId();
  const spanId = generateId();

  const db = getDatabase();
  db.prepare(`
    INSERT INTO ai_traces (id, trace_id, parent_span_id, name, type, status, started_at)
    VALUES (?, ?, NULL, ?, 'span', 'running', datetime('now'))
  `).run(spanId, traceId, name);

  currentContext = { traceId, spanId };

  // Log trace start
  logTraceStart(name, traceId);

  return currentContext;
}

/**
 * Start a child span under the current context
 */
export function startSpan(
  name: string,
  options: {
    type?: "generation" | "span" | "event";
    model?: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
  } = {}
): string {
  ensureTracesTable();
  const spanId = generateId();
  const traceId = currentContext?.traceId ?? generateId();
  const parentSpanId = currentContext?.spanId ?? null;

  const db = getDatabase();
  db.prepare(`
    INSERT INTO ai_traces (id, trace_id, parent_span_id, name, type, model, input, status, metadata, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, datetime('now'))
  `).run(
    spanId,
    traceId,
    parentSpanId,
    name,
    options.type ?? "span",
    options.model ?? null,
    options.input ? JSON.stringify(options.input) : null,
    options.metadata ? JSON.stringify(options.metadata) : null
  );

  // Log span start
  logSpanStart(name, spanId, traceId, options.model);

  // Store previous context for restoration
  const previousContext = currentContext;
  (globalThis as Record<string, unknown>)[`_trace_parent_${spanId}`] = previousContext;

  // Update current context to this span
  currentContext = { traceId, spanId };

  return spanId;
}

/**
 * End a span with results
 */
export function endSpan(
  spanId: string,
  options: {
    output?: unknown;
    inputTokens?: number;
    outputTokens?: number;
    error?: Error | string;
  } = {}
): void {
  const db = getDatabase();
  const spanData = db
    .prepare("SELECT started_at, model FROM ai_traces WHERE id = ?")
    .get(spanId) as { started_at: string; model: string | null } | undefined;

  if (!spanData) {
    console.warn(`[Observability] Span ${spanId} not found`);
    return;
  }

  const latencyMs = Date.now() - new Date(spanData.started_at).getTime();
  const totalTokens = (options.inputTokens ?? 0) + (options.outputTokens ?? 0);

  const cost = spanData.model
    ? calculateCost(spanData.model, options.inputTokens ?? 0, options.outputTokens ?? 0)
    : 0;

  db.prepare(`
    UPDATE ai_traces SET
      output = ?,
      input_tokens = ?,
      output_tokens = ?,
      total_tokens = ?,
      latency_ms = ?,
      cost_usd = ?,
      status = ?,
      error_message = ?,
      ended_at = datetime('now')
    WHERE id = ?
  `).run(
    options.output ? JSON.stringify(options.output) : null,
    options.inputTokens ?? null,
    options.outputTokens ?? null,
    totalTokens || null,
    latencyMs,
    cost || null,
    options.error ? "error" : "success",
    options.error ? (typeof options.error === "string" ? options.error : options.error.message) : null,
    spanId
  );

  // Log span end
  const spanName = db.prepare("SELECT name FROM ai_traces WHERE id = ?").get(spanId) as { name: string } | undefined;
  logSpanEnd(
    spanName?.name ?? spanId,
    spanId,
    latencyMs,
    { input: options.inputTokens, output: options.outputTokens },
    cost || undefined,
    options.error ? (typeof options.error === "string" ? options.error : options.error.message) : undefined
  );

  // Restore parent context
  const previousContext = (globalThis as Record<string, unknown>)[`_trace_parent_${spanId}`] as TraceContext | null;
  currentContext = previousContext;
  delete (globalThis as Record<string, unknown>)[`_trace_parent_${spanId}`];
}

/**
 * End the current trace
 */
export function endTrace(options: { error?: Error | string } = {}): void {
  if (!currentContext) return;

  const db = getDatabase();
  const traceId = currentContext.traceId;

  // Find root span
  const rootSpan = db
    .prepare("SELECT id, started_at FROM ai_traces WHERE trace_id = ? AND parent_span_id IS NULL")
    .get(traceId) as { id: string; started_at: string } | undefined;

  if (rootSpan) {
    const latencyMs = Date.now() - new Date(rootSpan.started_at).getTime();

    // Calculate total cost for trace
    const totals = db
      .prepare(`
        SELECT SUM(cost_usd) as total_cost, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output
        FROM ai_traces WHERE trace_id = ? AND type = 'generation'
      `)
      .get(traceId) as { total_cost: number | null; total_input: number | null; total_output: number | null };

    db.prepare(`
      UPDATE ai_traces SET
        input_tokens = ?, output_tokens = ?, total_tokens = ?,
        latency_ms = ?, cost_usd = ?, status = ?, error_message = ?, ended_at = datetime('now')
      WHERE id = ?
    `).run(
      totals.total_input,
      totals.total_output,
      (totals.total_input ?? 0) + (totals.total_output ?? 0),
      latencyMs,
      totals.total_cost,
      options.error ? "error" : "success",
      options.error ? (typeof options.error === "string" ? options.error : options.error.message) : null,
      rootSpan.id
    );

    // Log trace end
    logTraceEnd(
      latencyMs,
      totals.total_cost ?? undefined,
      options.error ? (typeof options.error === "string" ? options.error : options.error.message) : undefined
    );
  }

  currentContext = null;
}

// ============================================================================
// Wrapper: Observe an async function
// ============================================================================

type ObserveOptions = {
  name: string;
  type?: "generation" | "span" | "event";
  model?: string;
  extractTokens?: (result: unknown) => { inputTokens?: number; outputTokens?: number };
};

export function observe<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options: ObserveOptions
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const spanId = startSpan(options.name, {
      type: options.type,
      model: options.model,
      input: args.length === 1 ? args[0] : args,
    });

    try {
      const result = await fn(...args);
      const tokens = options.extractTokens?.(result) ?? {};
      endSpan(spanId, { output: result, inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens });
      return result;
    } catch (error) {
      endSpan(spanId, { error: error instanceof Error ? error : String(error) });
      throw error;
    }
  };
}

// ============================================================================
// Query: Get recent traces
// ============================================================================

export function getRecentTraces(limit = 50): TraceSpan[] {
  const db = getDatabase();
  ensureTracesTable();
  return db
    .prepare("SELECT * FROM ai_traces WHERE parent_span_id IS NULL ORDER BY started_at DESC LIMIT ?")
    .all(limit) as TraceSpan[];
}

export function getTraceSpans(traceId: string): TraceSpan[] {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM ai_traces WHERE trace_id = ? ORDER BY started_at ASC")
    .all(traceId) as TraceSpan[];
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
    .prepare(`
      SELECT
        COUNT(DISTINCT trace_id) as total_traces,
        SUM(CASE WHEN type = 'generation' THEN total_tokens ELSE 0 END) as total_tokens,
        SUM(CASE WHEN type = 'generation' THEN cost_usd ELSE 0 END) as total_cost,
        AVG(CASE WHEN parent_span_id IS NULL THEN latency_ms END) as avg_latency_ms,
        AVG(CASE WHEN status = 'error' THEN 1.0 ELSE 0.0 END) as error_rate
      FROM ai_traces WHERE started_at >= ?
    `)
    .get(cutoff.toISOString()) as {
    total_traces: number;
    total_tokens: number;
    total_cost: number;
    avg_latency_ms: number;
    error_rate: number;
  };

  const byModel = db
    .prepare(`
      SELECT model, COUNT(*) as count, SUM(total_tokens) as tokens, SUM(cost_usd) as cost
      FROM ai_traces WHERE started_at >= ? AND model IS NOT NULL GROUP BY model
    `)
    .all(cutoff.toISOString()) as Array<{ model: string; count: number; tokens: number; cost: number }>;

  return {
    ...stats,
    by_model: Object.fromEntries(byModel.map((m) => [m.model, { count: m.count, tokens: m.tokens, cost: m.cost }])),
  };
}
