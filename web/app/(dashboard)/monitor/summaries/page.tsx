"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/utils";

interface SummaryFreshnessRow {
  source: string;
  id: string;
  title: string;
  hasSummary: boolean;
  contentUpdatedAt: string | null;
  summaryUpdatedAt: string | null;
  isStale: boolean;
}

interface SummaryReport {
  total: number;
  withSummary: number;
  missingSummary: number;
  stale: number;
  bySource: Record<
    string,
    { total: number; withSummary: number; missingSummary: number; stale: number }
  >;
  items: SummaryFreshnessRow[];
}

type Filter = "chats" | "all";

function statusLabel(row: SummaryFreshnessRow): "missing" | "stale" | "ok" {
  if (!row.hasSummary) return "missing";
  if (row.isStale) return "stale";
  return "ok";
}

export default function SummariesDashboardPage() {
  const [report, setReport] = useState<SummaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("chats");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kronus/summary-status");
      if (!res.ok) throw new Error(`summary-status ${res.status}`);
      setReport(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const chatRows = useMemo(() => {
    if (!report) return [];
    return report.items.filter((i) => i.source === "chat");
  }, [report]);

  const visibleRows = useMemo(() => {
    if (!report) return [];
    if (filter === "chats") return chatRows;
    return report.items;
  }, [report, filter, chatRows]);

  const chatMissing = chatRows.filter((r) => !r.hasSummary).length;
  const chatStale = chatRows.filter((r) => r.isStale).length;

  const handleGenerateChat = async (id: string, force: boolean) => {
    setGeneratingId(id);
    try {
      const res = await fetch(`/api/conversations/${id}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (res.ok) await load();
    } finally {
      setGeneratingId(null);
    }
  };

  const handleBackfillMissing = async () => {
    setBackfilling(true);
    setBackfillMsg(null);
    try {
      const res = await fetch("/api/conversations/backfill-summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backfill failed");
      setBackfillMsg(
        `Processed ${data.processed ?? 0}: ${data.successful ?? 0} ok, ${data.failed ?? 0} failed`,
      );
      await load();
    } catch (err) {
      setBackfillMsg(err instanceof Error ? err.message : "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="cp-root">
      <div className="cp-header">
        <div className="cp-header-text">
          <Link href="/monitor" className="sum-dash-back">
            <ArrowLeft size={14} /> Control Panel
          </Link>
          <h1 className="cp-title">Summary Management</h1>
          <p className="cp-subtitle">
            Kronus Lite indexes summaries only. Chats without a summary are invisible to the chat
            index until you generate one.
          </p>
        </div>
        <div className="sum-dash-actions">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleBackfillMissing}
            disabled={backfilling || chatMissing === 0}
          >
            {backfilling ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            Backfill missing chats ({chatMissing})
          </Button>
        </div>
      </div>

      <div className="cp-body sum-dash-body">
        {loading && (
          <div className="cp-spinner-center">
            <Loader2 className="animate-spin" size={18} />
          </div>
        )}
        {error && <p className="cp-error-msg">{error}</p>}
        {backfillMsg && <p className="sum-dash-msg">{backfillMsg}</p>}

        {report && !loading && (
          <>
            <section className="cp-context-hero">
              <div className="cp-context-kpis">
                <div className="sum-kpi sum-kpi-chats">
                  <MessageSquare size={16} />
                  <div>
                    <strong>{chatRows.length}</strong>
                    <span>hourglass chats</span>
                  </div>
                </div>
                <div className="sum-kpi">
                  <strong>{chatRows.filter((r) => r.hasSummary).length}</strong>
                  <span>with summary</span>
                </div>
                <div className="sum-kpi sum-kpi-warn">
                  <strong>{chatMissing}</strong>
                  <span>missing</span>
                </div>
                <div className="sum-kpi sum-kpi-warn">
                  <strong>{chatStale}</strong>
                  <span>stale (edited after summarize)</span>
                </div>
              </div>
            </section>

            <div className="sum-dash-filters">
              {(["chats", "all"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`cp-tab${filter === f ? " cp-tab-active" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "chats" ? "Chats only" : `All sources (${report.total})`}
                </button>
              ))}
            </div>

            <div className="sum-dash-table-wrap">
              <table className="sum-dash-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Title</th>
                    <th>Content saved</th>
                    <th>Summarized</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="sum-dash-empty">
                        Nothing to show for this filter.
                      </td>
                    </tr>
                  )}
                  {visibleRows.map((row) => {
                    const st = statusLabel(row);
                    const isChat = row.source === "chat";
                    const needs = isChat && (!row.hasSummary || row.isStale);

                    return (
                      <tr key={`${row.source}-${row.id}`} className={`sum-row-${st}`}>
                        <td>
                          <span className={`sum-badge sum-badge-${st}`}>
                            {st === "missing" && <EyeOff size={12} />}
                            {st === "stale" && <RefreshCw size={12} />}
                            {st === "ok" && <Eye size={12} />}
                            {st}
                          </span>
                        </td>
                        <td>
                          <code>{row.source}</code>
                        </td>
                        <td className="sum-dash-title">{row.title}</td>
                        <td className="sum-dash-date">
                          {row.contentUpdatedAt
                            ? formatDateShort(row.contentUpdatedAt)
                            : "—"}
                        </td>
                        <td className="sum-dash-date">
                          {row.summaryUpdatedAt
                            ? formatDateShort(row.summaryUpdatedAt)
                            : "—"}
                        </td>
                        <td>
                          {isChat && needs && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={generatingId === row.id}
                              onClick={() =>
                                handleGenerateChat(row.id, row.hasSummary)
                              }
                            >
                              {generatingId === row.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Sparkles size={14} />
                              )}
                              {row.hasSummary ? "Update" : "Generate"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filter === "all" && (
              <section className="cp-context-section">
                <h3 className="cp-section-title">By source</h3>
                <div className="cp-context-grid">
                  {Object.entries(report.bySource)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([source, s]) => (
                      <div key={source} className="cp-context-source-card">
                        <div className="cp-context-source-top">
                          <strong>{source}</strong>
                          <span>
                            {s.withSummary}/{s.total}
                          </span>
                        </div>
                        <div className="cp-context-source-tokens">
                          {s.missingSummary} missing · {s.stale} stale
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
