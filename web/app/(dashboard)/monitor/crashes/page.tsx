"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ErrorRow {
  id: number;
  sessionId: string;
  receivedAt: string;
  kind: string;
  message: string;
  source: string | null;
  lineno: number | null;
  url: string | null;
  conversationId: number | null;
}

interface MemSample {
  t: number;
  heap?: number;
  nodes?: number;
  ctx?: Record<string, unknown>;
}

interface ErrorDetail extends ErrorRow {
  stack: string | null;
  colno: number | null;
  userAgent: string | null;
  context: Record<string, unknown> | null;
  memTail: MemSample[];
}

function fmtTime(iso: string): string {
  try {
    const stamp = iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
    return new Date(stamp).toLocaleString();
  } catch {
    return iso;
  }
}

function kindColor(kind: string): string {
  return kind === "unhandledrejection"
    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
    : "bg-red-500/20 text-red-300 border-red-500/40";
}

export default function ClientCrashesPage() {
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ErrorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/observability/client-errors?limit=100");
      const data = (await res.json()) as { ok?: boolean; errors?: ErrorRow[]; reason?: string };
      if (!res.ok || !data.ok) throw new Error(data.reason ?? "Failed to load client errors");
      setErrors(data.errors ?? []);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    fetch(`/api/observability/client-errors?id=${selectedId}`)
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: ErrorDetail };
        if (data.ok && data.error) setDetail(data.error);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  return (
    <div className="min-h-full bg-[var(--tartarus-void)] text-[var(--tartarus-ivory)]">
      <header className="border-b border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/monitor"
                className="text-sm text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-teal)]"
              >
                ← Control panel
              </Link>
              <Bug className="h-5 w-5 text-[var(--tartarus-teal)]" />
              <h1 className="text-2xl font-semibold tracking-tight">Client Errors</h1>
              <Badge variant="outline" className="border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)]">
                dev only
              </Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-[var(--tartarus-ivory-muted)]">
              Uncaught JS errors and unhandled promise rejections from{" "}
              <code className="text-xs">web/lib/dev-client-errors.ts</code>. Each row includes live chat
              context and the memlog ring tail when the error fired.
            </p>
            <p className="mt-1 text-xs text-[var(--tartarus-ivory-dim)]">
              API for agents: <code>GET /api/observability/client-errors?limit=20</code>
              {" · "}
              <Link href="/monitor/memlog" className="text-[var(--tartarus-teal)] hover:underline">
                Memory breaches
              </Link>
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_520px]">
        <section className="space-y-2">
          {fetchError && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {fetchError}
            </div>
          )}

          {!loading && errors.length === 0 && (
            <div className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] px-4 py-8 text-center text-sm text-[var(--tartarus-ivory-muted)]">
              No client errors recorded yet. When the tab throws, they appear here automatically.
            </div>
          )}

          {errors.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              className={`flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition hover:border-[var(--tartarus-teal-dim)] ${
                selectedId === row.id
                  ? "border-[var(--tartarus-teal)] bg-[var(--tartarus-surface)]"
                  : "border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <Badge className={`border ${kindColor(row.kind)}`}>{row.kind}</Badge>
                <span className="font-mono text-xs text-[var(--tartarus-ivory-muted)]">
                  {fmtTime(row.receivedAt)}
                </span>
                {row.conversationId != null && (
                  <span className="ml-auto text-xs text-[var(--tartarus-teal)]">chat #{row.conversationId}</span>
                )}
              </div>
              <div className="truncate text-sm">{row.message}</div>
              {row.source && (
                <div className="truncate text-xs text-[var(--tartarus-ivory-muted)]">
                  {row.source}
                  {row.lineno != null ? `:${row.lineno}` : ""}
                </div>
              )}
            </button>
          ))}
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--tartarus-gold)]" />
              <h2 className="text-base font-medium">Error detail</h2>
            </div>

            {selectedId == null && (
              <p className="text-sm text-[var(--tartarus-ivory-muted)]">Select an error to inspect stack + context.</p>
            )}

            {detailLoading && <p className="text-sm text-[var(--tartarus-ivory-muted)]">Loading…</p>}

            {detail && !detailLoading && (
              <div className="space-y-3 text-sm">
                <pre className="max-h-40 overflow-auto rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-2 text-xs whitespace-pre-wrap">
                  {detail.stack ?? "(no stack)"}
                </pre>
                {detail.context && (
                  <div>
                    <div className="text-xs uppercase text-[var(--tartarus-ivory-muted)]">Context</div>
                    <pre className="mt-1 max-h-32 overflow-auto rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-2 text-xs">
                      {JSON.stringify(detail.context, null, 2)}
                    </pre>
                  </div>
                )}
                {detail.memTail.length > 0 && (
                  <div>
                    <div className="text-xs uppercase text-[var(--tartarus-ivory-muted)]">
                      Mem tail ({detail.memTail.length})
                    </div>
                    <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
                      <table className="w-full text-xs font-mono">
                        <thead className="sticky top-0 bg-[var(--tartarus-deep)]">
                          <tr className="text-left text-[var(--tartarus-ivory-muted)]">
                            <th className="px-2 py-1">t</th>
                            <th className="px-2 py-1">heap</th>
                            <th className="px-2 py-1">nodes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.memTail.map((s, i) => (
                            <tr key={i} className="border-t border-[var(--tartarus-border)]/40">
                              <td className="px-2 py-1">{new Date(s.t).toLocaleTimeString()}</td>
                              <td className="px-2 py-1">{s.heap ?? "—"}</td>
                              <td className="px-2 py-1">{s.nodes ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-4 text-xs text-[var(--tartarus-ivory-muted)]">
            <p className="mb-1 font-medium text-[var(--tartarus-ivory)]">Browser console</p>
            <code className="block">window.__dumpClientErrors()</code>
            <code className="block">localStorage.getItem(&quot;dev-client-errors&quot;)</code>
            <p className="mt-2">
              Tab freezes without a thrown error won&apos;t appear here — check{" "}
              <Link href="/monitor/memlog" className="text-[var(--tartarus-teal)] hover:underline">
                Memory breaches
              </Link>{" "}
              for heap spikes instead.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
