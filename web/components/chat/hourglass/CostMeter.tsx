"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Current conversation id. Null means there's no chat yet (no cost to display). */
  conversationId: number | null;
  /** Polled live every N ms while focused. */
  pollMs?: number;
}

interface Breakdown {
  source: string;
  cost: number;
}

interface CostPayload {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  breakdown: Breakdown[];
}

/**
 * Topbar cost meter — running cost (USD) for the current chat, summed
 * across Kronus chat completion + tool calls + Muse decisions + observer
 * + per-image paint costs. Reads from the conversation row populated
 * server-side by `recomputeConversationCost()`.
 */
export function CostMeter({ conversationId, pollMs = 8000 }: Props) {
  const [data, setData] = useState<CostPayload | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setData(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/cost`);
        if (!res.ok) return;
        const json = (await res.json()) as CostPayload;
        if (!cancelled) setData(json);
      } catch {
        /* non-critical */
      }
    };
    void tick();
    const id = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [conversationId, pollMs]);

  if (!conversationId || !data) {
    return null;
  }

  // Visual color shifts at €5 → amber, €15 → red.
  const cost = data.costUsd;
  const tone = cost >= 15 ? "danger" : cost >= 5 ? "warn" : "ok";

  // Tooltip text — built lazily.
  const tooltip = data.breakdown.length
    ? data.breakdown
        .map((b) => `${b.source}: $${b.cost.toFixed(4)}`)
        .join(" · ") + ` · ${data.inputTokens.toLocaleString()} in / ${data.outputTokens.toLocaleString()} out tok`
    : `$${cost.toFixed(4)} so far`;

  return (
    <span
      className={`hg-topbar-cost hg-topbar-cost-${tone}`}
      title={tooltip}
    >
      <span className="hg-topbar-cost-glyph">$</span>
      <span className="hg-topbar-cost-val">{cost.toFixed(cost >= 1 ? 2 : 4)}</span>
    </span>
  );
}
