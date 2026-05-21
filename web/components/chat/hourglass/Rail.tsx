"use client";

import { useEffect, useState } from "react";
import { MessageSquare, BookOpen, Archive, Menu, Plus, Sparkles } from "lucide-react";
import type { Turn, RailView } from "./types";

interface SavedConversation {
  id: number;
  title: string;
  updated_at: string;
  /** Running cost for the chat (USD). Populated server-side. */
  cost_usd?: number | null;
  /** Token totals (actual). */
  actual_input_tokens?: number | null;
  actual_output_tokens?: number | null;
  /** Last muse-image thumbUrl, derived from artifact_refs. */
  latest_thumb_url?: string | null;
  /** Number of artifacts on the shelf (parsed from artifact_refs JSON). */
  artifact_count?: number | null;
  /** AI-generated summary (one-line living summary). */
  summary?: string | null;
}

interface RailProps {
  view: RailView;
  onViewChange: (v: RailView) => void;
  turns: Turn[];
  currentTurn: number;
  viewingTurn: number;
  onScrollToTurn: (n: number) => void;
  onNewChat: () => void;
  onLoadConversation?: (id: number) => void;
  open: boolean;
  onToggleOpen: () => void;
  conversationTitle: string;
  conversationStartedAt: number;
  modelLabel: string;
  currentConversationId?: number | null;
}

export function Rail({
  view,
  onViewChange,
  turns,
  currentTurn,
  viewingTurn,
  onScrollToTurn,
  onNewChat,
  onLoadConversation,
  open,
  onToggleOpen,
  currentConversationId,
}: RailProps) {
  const [savedConvs, setSavedConvs] = useState<SavedConversation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Lazy-load history when the rail opens. The rail is conversation history:
  // the current chat's beat navigation lives in the main stream/shelf.
  useEffect(() => {
    if (!open || savedConvs.length > 0) return;
    setLoadingHistory(true);
    fetch("/api/conversations?limit=40")
      .then(async (res) => {
        if (!res.ok) return;
        const { conversations } = (await res.json()) as { conversations: SavedConversation[] };
        setSavedConvs(conversations ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [open, savedConvs.length]);

  const otherConvs = savedConvs.filter((c) => c.id !== currentConversationId);

  return (
    <aside className={`hg-rail${open ? " hg-open" : ""}`}>
      <div className="hg-rail-col">
        <button
          className={`hg-rail-ic${view === "chat" ? " active" : ""}`}
          title="Hourglass · Kronos stream (Muse on the right)"
          onClick={() => onViewChange("chat")}
          aria-label="Chat"
        >
          <MessageSquare />
        </button>
        <button
          className={`hg-rail-ic${view === "reader" ? " active" : ""}`}
          title="Reader · Browse journal entries"
          onClick={() => onViewChange("reader")}
          aria-label="Reader"
        >
          <BookOpen />
        </button>
        <button
          className={`hg-rail-ic${view === "repo" ? " active" : ""}`}
          title="Library · Unified knowledge base"
          onClick={() => onViewChange("repo")}
          aria-label="Library"
        >
          <Archive />
        </button>

        <div className="hg-rail-divider" />

        <button className="hg-rail-ic" title="Chat history" onClick={onToggleOpen} aria-label="Open chat history">
          <Menu />
        </button>
        <button className="hg-rail-ic" title="New chat" onClick={onNewChat} aria-label="New chat">
          <Plus />
        </button>
      </div>

      {/* Expanded panel */}
      <div className="hg-rail-panel">
        <div className="hg-rail-open-head">
          <h3>chat history</h3>
          <div className="hg-sub">other saved conversations</div>
        </div>

        <div className="hg-rail-tabs hg-rail-actions">
          <span className="hg-rail-tab active">history</span>
          <div style={{ flex: 1 }} />
          <button className="hg-rail-new-btn" onClick={onNewChat} title="New conversation">
            <Plus size={12} /> new
          </button>
        </div>

        <div className="hg-turn-list">
          {loadingHistory && (
            <div className="hg-rail-empty">loading...</div>
          )}
          {!loadingHistory && otherConvs.length === 0 && (
            <div className="hg-rail-empty">no other saved conversations yet</div>
          )}
          {otherConvs.map((c) => {
            const age = new Date(c.updated_at).toLocaleDateString([], { month: "short", day: "numeric" });
            const cost = typeof c.cost_usd === "number" ? c.cost_usd : 0;
            const totalTokens = (c.actual_input_tokens ?? 0) + (c.actual_output_tokens ?? 0);
            const artifactN = c.artifact_count ?? 0;
            return (
              <button
                key={c.id}
                className="hg-turn-row hg-history-row"
                onClick={() => onLoadConversation?.(c.id)}
                title={c.summary ?? c.title ?? "untitled"}
              >
                {c.latest_thumb_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img className="hg-hist-thumb" src={c.latest_thumb_url} alt="" />
                ) : (
                  <div className="hg-hist-thumb hg-hist-thumb-empty">
                    <Sparkles size={14} />
                  </div>
                )}
                <div className="hg-body">
                  <div className="hg-q">{c.title || "untitled"}</div>
                  {c.summary && <div className="hg-a">{c.summary}</div>}
                  <div className="hg-hist-meta">
                    {artifactN > 0 && <span title="artifacts on shelf">art {artifactN}</span>}
                    {cost > 0 && <span title="running cost">${cost < 1 ? cost.toFixed(4) : cost.toFixed(2)}</span>}
                    {totalTokens > 0 && <span title="tokens">~{(totalTokens / 1000).toFixed(1)}k tok</span>}
                    <span title={new Date(c.updated_at).toLocaleString()}>{age}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
