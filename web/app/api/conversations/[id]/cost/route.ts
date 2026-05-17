/**
 * GET /api/conversations/[id]/cost
 *
 * Returns the running cost for a conversation — total USD, token totals,
 * and a per-source breakdown (Kronus chat, Muse decisions, Muse observer,
 * Muse paints, Kronus tool calls). Powers the topbar cost meter tooltip.
 *
 * Reads from `chat_conversations` (denormalized totals) for the headline
 * number and `ai_traces` (grouped by name/endpoint) for the breakdown.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";

interface BreakdownRow {
  source: string;
  cost: number;
}

export const GET = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const params = await context?.params;
    const conversationId = Number(params?.id);
    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 });
    }

    const db = getDatabase();
    // Denormalized totals — written by recomputeConversationCost().
    const conv = db
      .prepare(
        `SELECT cost_usd, actual_input_tokens, actual_output_tokens
           FROM chat_conversations WHERE id = ?`
      )
      .get(conversationId) as
      | { cost_usd: number | null; actual_input_tokens: number | null; actual_output_tokens: number | null }
      | undefined;

    // Breakdown: group traces by their `name` so the user sees who spent
    // what (chat / muse-decision / muse-observe / image:gpt-image-2 / ...).
    let breakdown: BreakdownRow[] = [];
    try {
      const rows = db
        .prepare(
          `SELECT name AS source, COALESCE(SUM(cost_usd), 0) AS cost
             FROM ai_traces
             WHERE conversation_id = ? AND status = 'success' AND cost_usd IS NOT NULL
             GROUP BY name
             ORDER BY cost DESC`
        )
        .all(conversationId) as Array<{ source: string; cost: number }>;
      breakdown = rows
        .filter((r) => r.cost > 0)
        .map((r) => ({ source: simplifySourceName(r.source), cost: r.cost }));
    } catch {
      /* table may not exist yet on a fresh install */
    }

    return NextResponse.json({
      costUsd: conv?.cost_usd ?? 0,
      inputTokens: conv?.actual_input_tokens ?? 0,
      outputTokens: conv?.actual_output_tokens ?? 0,
      breakdown,
    });
  },
);

/**
 * Map raw trace span names to friendlier labels for the tooltip.
 *   "chat"            → "Kronus"
 *   "muse-decision"   → "Muse decide"
 *   "muse-observe"    → "Muse observe"
 *   "muse-paint"      → "Muse paint"
 *   "image:..."       → "Image (...)"
 *   anything else     → as-is
 */
function simplifySourceName(name: string): string {
  if (name === "chat") return "Kronus";
  if (name.startsWith("image:")) return `Image (${name.slice(6)})`;
  if (name.startsWith("muse-")) {
    const rest = name.slice(5);
    return `Muse ${rest.replace(/-/g, " ")}`;
  }
  return name;
}
