"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Archive, BookOpen, History, MessageSquare, Plus, Sparkles } from "lucide-react";
import { ConversationSummaryControls } from "./ConversationSummaryControls";
import type { ConversationSummaryRow } from "@/lib/conversation-summary-ui";

interface SavedConversation extends ConversationSummaryRow {
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
  onNewChat,
  onLoadConversation,
  open,
  onToggleOpen,
  currentConversationId,
}: RailProps) {
  const pathname = usePathname();
  const [savedConvs, setSavedConvs] = useState<SavedConversation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = () => {
    setLoadingHistory(true);
    fetch("/api/conversations?limit=40")
      .then(async (res) => {
        if (!res.ok) return;
        const { conversations } = (await res.json()) as { conversations: SavedConversation[] };
        setSavedConvs(conversations ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  };

  // Reload history whenever the rail opens (summary state may have changed).
  useEffect(() => {
    if (!open) return;
    loadHistory();
  }, [open]);

  const otherConvs = savedConvs.filter((c) => c.id !== currentConversationId);
  const navItems = [
    { href: "/chat", label: "Chat", icon: MessageSquare },
    { href: "/reader", label: "Reader", icon: BookOpen },
    { href: "/library", label: "Library", icon: Archive },
    { href: "/monitor", label: "Control Panel", icon: Activity },
  ];

  const isActiveHref = (href: string) =>
    pathname === href || (href !== "/chat" && pathname?.startsWith(`${href}/`));

  return (
    <aside className={`hg-rail${open ? " hg-open" : ""}`}>
      <div className="hg-rail-col">
        <div className="hg-rail-group">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`hg-rail-ic${isActiveHref(item.href) ? " active" : ""}`}
                title={item.label}
                aria-label={item.label}
              >
                <Icon />
              </Link>
            );
          })}
        </div>

        <div className="hg-rail-divider" />

        <div className="hg-rail-group">
          <button className={`hg-rail-ic${open ? " active" : ""}`} title="Chat history" onClick={onToggleOpen} aria-label="Open chat history">
            <History />
          </button>
          <button className="hg-rail-ic" title="New chat" onClick={onNewChat} aria-label="New chat">
            <Plus />
          </button>
        </div>

        <div className="hg-rail-spacer" />
      </div>

      {/* Expanded panel */}
      <div className="hg-rail-panel">
        <div className="hg-rail-open-head">
          <h3>Chat History</h3>
          <div className="hg-sub">Other saved conversations</div>
        </div>

        <div className="hg-rail-tabs hg-rail-actions">
          <span className="hg-rail-tab active">History</span>
          <div style={{ flex: 1 }} />
          <button className="hg-rail-new-btn" onClick={onNewChat} title="New conversation">
            <Plus size={12} /> New
          </button>
        </div>

        <div className="hg-turn-list">
          {loadingHistory && (
            <div className="hg-rail-empty">loading...</div>
          )}
          {!loadingHistory && otherConvs.length === 0 && (
            <div className="hg-rail-empty">No other saved conversations yet</div>
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
                  <div className="hg-hist-title-row">
                    <div className="hg-q">{c.title || "untitled"}</div>
                    <ConversationSummaryControls
                      conv={c}
                      size="sm"
                      onUpdated={(patch) =>
                        setSavedConvs((prev) =>
                          prev.map((row) => (row.id === c.id ? { ...row, ...patch } : row)),
                        )
                      }
                    />
                  </div>
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
