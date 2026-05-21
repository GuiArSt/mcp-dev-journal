/**
 * GET /api/conversations/[id]/cost/ledger
 *
 * Human-readable accounting for how a chat's cost accumulated. Uses the
 * existing ai_traces table so the top-line cost meter and ledger cannot drift.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";

type TraceRow = {
  id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  type: string;
  model: string | null;
  endpoint: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  status: string;
  error_message: string | null;
  metadata: string | null;
  started_at: string;
  ended_at: string | null;
};

type LedgerCategory =
  | "kronus"
  | "muse-images"
  | "muse-decisions"
  | "muse-thoughts"
  | "summaries"
  | "tools"
  | "other";

type LedgerItem = {
  id: string;
  traceId: string;
  at: string;
  label: string;
  category: LedgerCategory;
  status: string;
  model: string | null;
  endpoint: string | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  detail: string | null;
  error: string | null;
};

type CategorySummary = {
  category: LedgerCategory;
  label: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  count: number;
};

const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  kronus: "Kronus replies",
  "muse-images": "Muse images",
  "muse-decisions": "Muse decisions",
  "muse-thoughts": "Muse thoughts",
  summaries: "Summaries",
  tools: "Tool-backed AI calls",
  other: "Other AI calls",
};

export const GET = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const params = await context?.params;
    const conversationId = Number(params?.id);
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }

    const db = getDatabase();
    const conv = db
      .prepare(
        `SELECT cost_usd, actual_input_tokens, actual_output_tokens
           FROM chat_conversations WHERE id = ?`,
      )
      .get(conversationId) as
      | { cost_usd: number | null; actual_input_tokens: number | null; actual_output_tokens: number | null }
      | undefined;

    let rows: TraceRow[] = [];
    try {
      rows = db
        .prepare(
          `SELECT id, trace_id, parent_span_id, name, type, model, endpoint,
                  input_tokens, output_tokens, total_tokens, latency_ms,
                  cost_usd, status, error_message, metadata, started_at, ended_at
             FROM ai_traces
            WHERE conversation_id = ?
            ORDER BY started_at ASC, id ASC`,
        )
        .all(conversationId) as TraceRow[];
    } catch {
      rows = [];
    }

    const items = rows.map(toLedgerItem);
    const categories = summarizeCategories(items);

    return NextResponse.json({
      conversationId,
      total: {
        costUsd: conv?.cost_usd ?? sum(items, "costUsd"),
        inputTokens: conv?.actual_input_tokens ?? sum(items, "inputTokens"),
        outputTokens: conv?.actual_output_tokens ?? sum(items, "outputTokens"),
      },
      categories,
      items,
    });
  },
);

function toLedgerItem(row: TraceRow): LedgerItem {
  const metadata = parseMetadata(row.metadata);
  const category = categorize(row);
  return {
    id: row.id,
    traceId: row.trace_id,
    at: row.started_at,
    label: labelFor(row, metadata),
    category,
    status: row.status,
    model: row.model,
    endpoint: row.endpoint,
    costUsd: row.status === "success" ? row.cost_usd ?? 0 : 0,
    inputTokens: row.input_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    latencyMs: row.latency_ms,
    detail: detailFor(row, metadata),
    error: row.error_message,
  };
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function categorize(row: TraceRow): LedgerCategory {
  if (row.name === "chat") return "kronus";
  if (row.name.startsWith("image:") || row.name === "muse-paint" || row.name === "muse-paint-edit" || row.type === "image") {
    return "muse-images";
  }
  if (row.name === "muse-observe") return "muse-thoughts";
  if (row.name.startsWith("muse-")) return "muse-decisions";
  if (row.name.includes("summary") || row.name.includes("summarize")) return "summaries";
  if (row.endpoint && row.endpoint.includes("/api/")) return "tools";
  return "other";
}

function labelFor(row: TraceRow, metadata: Record<string, unknown>): string {
  if (row.name === "chat") return "Kronus reply";
  if (row.name === "muse-observe") return "Muse thought";
  if (row.name === "muse-propose") return "Muse proposal";
  if (row.name === "muse-generate-prompt") return "Muse prompt composition";
  if (row.name === "muse-paint") return "Muse image render";
  if (row.name === "muse-paint-edit") return "Muse image edit";
  if (row.name.startsWith("image:")) {
    const quality = typeof metadata.quality === "string" ? ` · ${metadata.quality}` : "";
    return `Image render${quality}`;
  }
  if (row.name.includes("summary") || row.name.includes("summarize")) return "Conversation summary";
  return friendlyName(row.name);
}

function detailFor(row: TraceRow, metadata: Record<string, unknown>): string | null {
  const details: string[] = [];
  if (typeof metadata.provider === "string") details.push(metadata.provider);
  if (typeof metadata.operation === "string") details.push(metadata.operation);
  if (typeof metadata.quality === "string") details.push(`${metadata.quality} quality`);
  if (typeof metadata.renderMode === "string") details.push(metadata.renderMode);
  if (row.endpoint) details.push(row.endpoint);
  return details.length ? details.join(" · ") : null;
}

function friendlyName(name: string): string {
  return name
    .replace(/^muse-/, "Muse ")
    .replace(/^kronus-/, "Kronus ")
    .replace(/[-_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function summarizeCategories(items: LedgerItem[]): CategorySummary[] {
  const map = new Map<LedgerCategory, CategorySummary>();
  for (const item of items) {
    const existing = map.get(item.category) ?? {
      category: item.category,
      label: CATEGORY_LABELS[item.category],
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      count: 0,
    };
    existing.costUsd += item.costUsd;
    existing.inputTokens += item.inputTokens;
    existing.outputTokens += item.outputTokens;
    existing.count += 1;
    map.set(item.category, existing);
  }
  return Array.from(map.values())
    .filter((c) => c.count > 0)
    .sort((a, b) => b.costUsd - a.costUsd);
}

function sum(items: LedgerItem[], key: "costUsd" | "inputTokens" | "outputTokens"): number {
  return items.reduce((acc, item) => acc + item[key], 0);
}
