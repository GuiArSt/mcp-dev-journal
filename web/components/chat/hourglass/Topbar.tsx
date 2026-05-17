"use client";

import { Settings } from "lucide-react";
import type { MoodTab } from "./types";
import { CostMeter } from "./CostMeter";

interface TopbarProps {
  title: string;
  /** Current chat — used to fetch the running cost meter live. */
  conversationId: number | null;
  /** Live shelf-tab state — hidden when shelf is collapsed. */
  shelfTabs?: {
    active: MoodTab;
    onChange: (tab: MoodTab) => void;
    counts: { mood: number; infographic: number; repo: number };
  };
  /** Whether the right-panel shelf is currently visible. Tabs hide when false. */
  shelfVisible: boolean;
}

/**
 * Topbar — `[Tartarus + ⊙ logo | left] · · · [💰 cost] [⚙ settings] [tabs]`
 *
 * The shelf tabs (MOOD / INFOGRAPHIC / REPO) sit on the far right, visually
 * attached to the right panel. When the shelf collapses, the tabs hide
 * and the chat hero takes the freed width.
 */
export function Topbar({ title, conversationId, shelfTabs, shelfVisible }: TopbarProps) {
  return (
    <header className="hg-topbar">
      <div className="hg-topbar-left">
        <div className="hg-brand-mark" />
        <span className="hg-brand-name">Tartarus</span>
        {title && (
          <span className="hg-topbar-crumb" title="This session’s title (saved with the conversation).">
            {title}
          </span>
        )}
      </div>

      <div className="hg-topbar-meta">
        <CostMeter conversationId={conversationId} />
        <button
          type="button"
          className="hg-topbar-settings"
          title="settings (coming soon)"
          aria-label="Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {shelfVisible && shelfTabs && (
        <div className="hg-topbar-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={shelfTabs.active === "mood"}
            className={`hg-topbar-tab${shelfTabs.active === "mood" ? " active" : ""}`}
            onClick={() => shelfTabs.onChange("mood")}
          >
            mood <span className="hg-topbar-tab-count">{shelfTabs.counts.mood}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={shelfTabs.active === "infographic"}
            className={`hg-topbar-tab${shelfTabs.active === "infographic" ? " active" : ""}`}
            onClick={() => shelfTabs.onChange("infographic")}
          >
            infographic <span className="hg-topbar-tab-count">{shelfTabs.counts.infographic}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={shelfTabs.active === "repo"}
            className={`hg-topbar-tab${shelfTabs.active === "repo" ? " active" : ""}`}
            onClick={() => shelfTabs.onChange("repo")}
          >
            repo <span className="hg-topbar-tab-count">{shelfTabs.counts.repo}</span>
          </button>
        </div>
      )}
    </header>
  );
}
