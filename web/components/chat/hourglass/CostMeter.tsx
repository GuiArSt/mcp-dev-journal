"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

interface LedgerCategory {
  category: string;
  label: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  count: number;
}

interface LedgerItem {
  id: string;
  at: string;
  label: string;
  category: string;
  status: string;
  model: string | null;
  endpoint: string | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  detail: string | null;
  error: string | null;
}

interface LedgerPayload {
  total: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  };
  categories: LedgerCategory[];
  items: LedgerItem[];
}

/**
 * Topbar cost meter — running cost (USD) for the current chat, summed
 * across Kronus chat completion + tool calls + Muse decisions + observer
 * + per-image paint costs. Reads from the conversation row populated
 * server-side by `recomputeConversationCost()`.
 */
export function CostMeter({ conversationId, pollMs = 8000 }: Props) {
  const [data, setData] = useState<CostPayload | null>(null);
  const [ledger, setLedger] = useState<LedgerPayload | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

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

  const loadLedger = useCallback(async () => {
    if (!conversationId) return;
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/cost/ledger`);
      if (!res.ok) return;
      const json = (await res.json()) as LedgerPayload;
      setLedger(json);
    } catch {
      /* non-critical */
    } finally {
      setLedgerLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!ledgerOpen) return;
    void loadLedger();
  }, [ledgerOpen, loadLedger, data?.costUsd]);

  useEffect(() => {
    if (!ledgerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setLedgerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLedgerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ledgerOpen]);

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
    <span ref={rootRef} className="hg-cost-meter">
      <button
        type="button"
        className={`hg-topbar-cost hg-topbar-cost-${tone}${ledgerOpen ? " hg-open" : ""}`}
        title={tooltip}
        aria-expanded={ledgerOpen}
        aria-haspopup="dialog"
        onClick={() => setLedgerOpen((open) => !open)}
      >
        <span className="hg-topbar-cost-glyph">$</span>
        <span className="hg-topbar-cost-val">{cost.toFixed(cost >= 1 ? 2 : 4)}</span>
      </button>
      {ledgerOpen && (
        <div className="hg-cost-ledger" role="dialog" aria-label="Cost ledger">
          <div className="hg-cost-ledger-head">
            <span>cost ledger</span>
            <strong>${data.costUsd.toFixed(data.costUsd >= 1 ? 2 : 4)}</strong>
          </div>
          <div className="hg-cost-ledger-sub">
            {data.inputTokens.toLocaleString()} in / {data.outputTokens.toLocaleString()} out tokens
          </div>

          <div className="hg-cost-ledger-section">
            <div className="hg-cost-ledger-label">by source</div>
            {ledgerLoading && !ledger ? (
              <div className="hg-cost-ledger-empty">loading ledger...</div>
            ) : ledger?.categories.length ? (
              ledger.categories.map((cat) => (
                <div key={cat.category} className="hg-cost-ledger-category">
                  <span>{cat.label}</span>
                  <span>{cat.count}x</span>
                  <strong>${cat.costUsd.toFixed(cat.costUsd >= 1 ? 2 : 4)}</strong>
                </div>
              ))
            ) : (
              <div className="hg-cost-ledger-empty">no priced events yet</div>
            )}
          </div>

          <div className="hg-cost-ledger-section">
            <div className="hg-cost-ledger-label">timeline</div>
            <div className="hg-cost-ledger-list">
              {ledger?.items.length ? (
                ledger.items.slice().reverse().map((item) => (
                  <div key={item.id} className={`hg-cost-ledger-item hg-status-${item.status}`}>
                    <div className="hg-cost-ledger-item-main">
                      <span className="hg-cost-ledger-time">{formatTime(item.at)}</span>
                      <span className="hg-cost-ledger-title">{item.label}</span>
                      <strong>${item.costUsd.toFixed(item.costUsd >= 1 ? 2 : 4)}</strong>
                    </div>
                    <div className="hg-cost-ledger-item-meta">
                      {item.model && <span>{item.model}</span>}
                      {(item.inputTokens > 0 || item.outputTokens > 0) && (
                        <span>{compactTokens(item.inputTokens)} in / {compactTokens(item.outputTokens)} out</span>
                      )}
                      {item.latencyMs != null && <span>{formatLatency(item.latencyMs)}</span>}
                      {item.detail && <span>{item.detail}</span>}
                      {item.error && <span className="hg-cost-ledger-error">{item.error}</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="hg-cost-ledger-empty">no trace rows for this chat</div>
              )}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function compactTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}
