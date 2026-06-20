"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import {
  type ConversationSummaryRow,
  conversationHasSummary,
  conversationNeedsSummary,
  conversationSummaryStatus,
} from "@/lib/conversation-summary-ui";
import { formatDateShort } from "@/lib/utils";

interface ConversationSummaryControlsProps {
  conv: ConversationSummaryRow;
  size?: "sm" | "md";
  onUpdated?: (patch: Partial<ConversationSummaryRow>) => void;
}

/**
 * Eye + regenerate controls (ported from legacy ChatInterface history sidebar).
 */
export function ConversationSummaryControls({
  conv,
  size = "md",
  onUpdated,
}: ConversationSummaryControlsProps) {
  const [generating, setGenerating] = useState(false);
  const hasSummary = conversationHasSummary(conv);
  const needsSummary = conversationNeedsSummary(conv);
  const status = conversationSummaryStatus(conv);
  const iconSize = size === "sm" ? 13 : 15;

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!needsSummary || generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/conversations/${conv.id}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: hasSummary }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        title?: string;
        summary?: string;
        summary_updated_at?: string;
      };
      onUpdated?.({
        title: data.title ?? conv.title,
        summary: data.summary ?? conv.summary,
        summary_updated_at: data.summary_updated_at ?? new Date().toISOString(),
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className={`hg-conv-summary-ctrl${size === "sm" ? " hg-conv-summary-ctrl-sm" : ""}`}
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Conversation summary"
    >
      <span
        className={`hg-conv-summary-eye${hasSummary ? " hg-has" : ""}`}
        title={
          hasSummary
            ? conv.summary ?? "Has summary"
            : "No summary — not in Kronus Lite chat index"
        }
      >
        {hasSummary ? <Eye size={iconSize} /> : <EyeOff size={iconSize} />}
      </span>

      <button
        type="button"
        className={`hg-conv-summary-btn${needsSummary ? " hg-needs" : ""}`}
        disabled={generating || !needsSummary}
        onClick={handleGenerate}
        title={
          generating
            ? "Generating…"
            : needsSummary
              ? status === "stale"
                ? "Update summary (chat changed)"
                : "Generate summary"
              : conv.summary_updated_at
                ? `Up to date · ${formatDateShort(conv.summary_updated_at)}`
                : "Summary up to date"
        }
        aria-label={needsSummary ? "Generate or update summary" : "Summary up to date"}
      >
        {generating ? (
          <Loader2 size={iconSize} className="hg-spin" />
        ) : (
          <RefreshCw size={iconSize} />
        )}
      </button>

      {status === "stale" && <span className="hg-conv-summary-pill hg-stale">stale</span>}
      {!hasSummary && <span className="hg-conv-summary-pill hg-missing">missing</span>}
    </div>
  );
}
