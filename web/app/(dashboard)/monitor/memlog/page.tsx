"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface MemSample {
  t: number;
  heap?: number;
  heapTotal?: number;
  heapLimit?: number;
  nodes?: number;
  ctx?: Record<string, unknown>;
}

interface BreachRow {
  id: number;
  sessionId: string;
  receivedAt: string;
  reason: string;
  trigger: "warn" | "alert" | "unload" | "manual";
  userAgent: string | null;
  url: string | null;
  conversationId: number | null;
  sampleCount: number;
  peakHeapMb: number | null;
  peakNodes: number | null;
}

interface BreachDetail extends BreachRow {
  samples: MemSample[];
}

function fmtTime(iso: string): string {
  // The route writes Date.toISOString() so this is always UTC with a Z.
  // Older rows (if any predate the fix) lack the Z — fall back gracefully
  // by appending it, on the assumption that legacy rows were also UTC.
  try {
    const stamp = iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
    return new Date(stamp).toLocaleString();
  } catch { return iso; }
}

function triggerColor(t: BreachRow["trigger"]): string {
  switch (t) {
    case "alert": return "bg-red-500/20 text-red-300 border-red-500/40";
    case "warn":  return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    case "unload": return "bg-purple-500/20 text-purple-300 border-purple-500/40";
    default: return "bg-slate-500/20 text-slate-300 border-slate-500/40";
  }
}

function shortUrl(url: string | null): string {
  if (!url) return "—";
  try { return new URL(url).pathname; } catch { return url; }
}

function shortUA(ua: string | null): string {
  if (!ua) return "—";
  // Just the browser family for the row view.
  if (/Chrome\/\d/.test(ua)) return "Chrome";
  if (/Firefox\/\d/.test(ua)) return "Firefox";
  if (/Safari\/\d/.test(ua) && !/Chrome/.test(ua)) return "Safari";
  return ua.slice(0, 24) + (ua.length > 24 ? "…" : "");
}

export default function MemlogPage() {
  const [breaches, setBreaches] = useState<BreachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<BreachDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/observability/memlog?limit=100");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.reason ?? "Failed to load memlog");
      setBreaches(data.breaches as BreachRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (selectedId == null) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/observability/memlog?id=${selectedId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) throw new Error(data.reason ?? "Failed to load breach");
        setDetail(data.breach as BreachDetail);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load breach");
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const grouped = useMemo(() => {
    // Group consecutive rows from the same session for visual clustering.
    const map = new Map<string, BreachRow[]>();
    for (const b of breaches) {
      const arr = map.get(b.sessionId) ?? [];
      arr.push(b);
      map.set(b.sessionId, arr);
    }
    return Array.from(map.entries());
  }, [breaches]);

  return (
    <div className="min-h-full bg-[var(--tartarus-void)] text-[var(--tartarus-ivory)]">
      <header className="border-b border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-[var(--tartarus-teal)]" />
              <h1 className="text-2xl font-semibold tracking-tight">Memory Breaches</h1>
              <Badge variant="outline" className="border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)]">
                dev only
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-[var(--tartarus-ivory-muted)]">
              Heap and DOM-node samples beaconed from <code className="text-xs">web/lib/dev-memlog.ts</code> when
              the client crosses warn ({"≥"}500MB), alert ({"≥"}1GB), or +100MB delta thresholds. Includes the
              last ring-tail captured on tab unload after a breach.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_520px]">
        <section className="space-y-4">
          {error && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {!loading && breaches.length === 0 && (
            <div className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] px-4 py-8 text-center text-sm text-[var(--tartarus-ivory-muted)]">
              No breaches recorded yet. Open the chat, type until the tab gets heavy, and they'll show up here.
            </div>
          )}

          {grouped.map(([sessionId, rows]) => (
            <div key={sessionId} className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-[var(--tartarus-ivory-muted)]">
                <span>Session</span>
                <code className="rounded bg-[var(--tartarus-surface)] px-1.5 py-0.5 text-[var(--tartarus-ivory)]">{sessionId}</code>
                <span>· {rows.length} breach{rows.length === 1 ? "" : "es"}</span>
              </div>
              <div className="grid gap-2">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-left transition hover:border-[var(--tartarus-teal-dim)] ${
                      selectedId === row.id
                        ? "border-[var(--tartarus-teal)] bg-[var(--tartarus-surface)]"
                        : "border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Badge className={`border ${triggerColor(row.trigger)}`}>{row.trigger}</Badge>
                      <span className="font-mono text-xs text-[var(--tartarus-ivory-muted)]">{fmtTime(row.receivedAt)}</span>
                      <span className="ml-auto flex items-center gap-2 text-xs">
                        {row.peakHeapMb != null && (
                          <span className={row.peakHeapMb >= 1000 ? "text-red-300" : row.peakHeapMb >= 500 ? "text-amber-300" : "text-[var(--tartarus-ivory-muted)]"}>
                            heap {row.peakHeapMb}MB
                          </span>
                        )}
                        {row.peakNodes != null && (
                          <span className="text-[var(--tartarus-ivory-muted)]">{row.peakNodes} nodes</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--tartarus-ivory-muted)]">
                      <span>{shortUrl(row.url)}</span>
                      <span>·</span>
                      <span>{shortUA(row.userAgent)}</span>
                      {row.conversationId && (
                        <>
                          <span>·</span>
                          <span>chat #{row.conversationId}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{row.sampleCount} samples</span>
                    </div>
                    <div className="truncate text-xs text-[var(--tartarus-ivory-muted)]">
                      <span className="text-[var(--tartarus-ivory-dim)]">reason:</span> {row.reason}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--tartarus-gold)]" />
              <h2 className="text-base font-medium">Breach detail</h2>
            </div>

            {selectedId == null && (
              <p className="text-sm text-[var(--tartarus-ivory-muted)]">Select a breach to see its sample timeline.</p>
            )}

            {detailLoading && (
              <p className="text-sm text-[var(--tartarus-ivory-muted)]">Loading…</p>
            )}

            {detail && !detailLoading && (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--tartarus-ivory-muted)]">Trigger</div>
                  <div className="flex items-center gap-2">
                    <Badge className={`border ${triggerColor(detail.trigger)}`}>{detail.trigger}</Badge>
                    <span className="text-[var(--tartarus-ivory-muted)]">{detail.reason}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[var(--tartarus-ivory-muted)]">Peak heap</div>
                    <div>{detail.peakHeapMb != null ? `${detail.peakHeapMb} MB` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[var(--tartarus-ivory-muted)]">Peak DOM nodes</div>
                    <div>{detail.peakNodes ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[var(--tartarus-ivory-muted)]">URL</div>
                    <div className="truncate font-mono text-xs">{detail.url ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[var(--tartarus-ivory-muted)]">Conversation</div>
                    <div>{detail.conversationId ?? "—"}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--tartarus-ivory-muted)]">
                    Samples ({detail.samples.length})
                  </div>
                  <div className="mt-1 max-h-[480px] overflow-y-auto rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[var(--tartarus-deep)]">
                        <tr className="text-left text-[var(--tartarus-ivory-muted)]">
                          <th className="px-2 py-1">t</th>
                          <th className="px-2 py-1">heap</th>
                          <th className="px-2 py-1">nodes</th>
                          <th className="px-2 py-1">ctx</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {detail.samples.map((s, i) => {
                          const dt = new Date(s.t).toLocaleTimeString();
                          const ctxStr = s.ctx ? JSON.stringify(s.ctx) : "";
                          return (
                            <tr key={i} className="border-t border-[var(--tartarus-border)]/40">
                              <td className="px-2 py-1 text-[var(--tartarus-ivory-muted)]">{dt}</td>
                              <td className={`px-2 py-1 ${s.heap && s.heap >= 1000 ? "text-red-300" : s.heap && s.heap >= 500 ? "text-amber-300" : ""}`}>
                                {s.heap ?? "—"}
                              </td>
                              <td className="px-2 py-1">{s.nodes ?? "—"}</td>
                              <td className="px-2 py-1 truncate max-w-[240px]" title={ctxStr}>{ctxStr}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-4 text-xs text-[var(--tartarus-ivory-muted)]">
            <p className="mb-1 font-medium text-[var(--tartarus-ivory)]">From the browser console</p>
            <code className="block">window.__dumpMemlog()</code>
            <code className="block">window.__flushMemlog("manual flush")</code>
            <p className="mt-2">
              The flush call beacons the current ring tail to this page without waiting for a threshold.
              Useful when you eyeball a spike yourself.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
