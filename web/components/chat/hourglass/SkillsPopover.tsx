"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Loader2, RefreshCw, Check, X } from "lucide-react";
import type { SkillConfig } from "@/lib/ai/skills";

export interface SkillOption {
  slug: string;
  title: string;
  summary?: string;
  config?: SkillConfig;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRect?: DOMRect | null;
  activeSkillSlugs: string[];
  onActiveSkillSlugsChange: (slugs: string[]) => void;
  onSkillsLoaded?: (skills: SkillOption[]) => void;
}

/**
 * Minimal skills selector: fetches prompt documents flagged as
 * `metadata.type === "kronus-skill"` and toggles their slugs in the
 * activeSkillSlugs array that the chat route already understands.
 *
 * No dependency on shadcn Popover — simple absolutely-positioned panel.
 */
export function SkillsPopover({
  open,
  onOpenChange,
  anchorRect,
  activeSkillSlugs,
  onActiveSkillSlugsChange,
  onSkillsLoaded,
}: Props) {
  const [skills, setSkills] = useState<SkillOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    if (!anchorRect || typeof window === "undefined") {
      setPosition(null);
      return;
    }
    const panelWidth = 340;
    const margin = 12;
    const left = Math.max(
      margin,
      Math.min(anchorRect.left, window.innerWidth - panelWidth - margin),
    );
    const availableAbove = Math.max(220, anchorRect.top - margin * 2);
    setPosition({
      left,
      bottom: window.innerHeight - anchorRect.top + 8,
      maxHeight: Math.min(window.innerHeight * 0.72, availableAbove),
    });
  }, [anchorRect]);

  // Sync Library: triggers a refresh of all integration caches + the
  // local registry rescan. The user wanted parity with the legacy /chat
  // skills tab — useful when external agents have added documents.
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const handleSyncLibrary = async () => {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncStatus(null);
    const targets = [
      { name: "Linear", url: "/api/integrations/linear/sync" },
      { name: "Slite", url: "/api/integrations/slite/sync" },
      { name: "Notion", url: "/api/integrations/notion/sync" },
    ];
    const results = await Promise.allSettled(
      targets.map(async (t) => {
        const res = await fetch(t.url, { method: "POST" });
        if (!res.ok) throw new Error(`${t.name} ${res.status}`);
        return t.name;
      }),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const total = results.length;
    setSyncStatus({ ok: ok === total, text: `synced ${ok}/${total}` });
    setSyncBusy(false);
    setTimeout(() => setSyncStatus(null), 3500);
  };

  // Lazy-load skills the first time the popover opens.
  useEffect(() => {
    if (!open || skills !== null) return;
    setLoading(true);
    setError(null);
    fetch("/api/documents?type=prompt&limit=100")
      .then(async (res) => {
        if (!res.ok) throw new Error(`skills ${res.status}`);
        const json = (await res.json()) as {
          documents: Array<{ slug: string; title: string; summary?: string; metadata?: string | Record<string, unknown> }>;
        };
        const out: SkillOption[] = [];
        for (const d of json.documents || []) {
          let meta: Record<string, unknown> = {};
          try {
            meta = typeof d.metadata === "string" ? JSON.parse(d.metadata) : (d.metadata ?? {});
          } catch { /* ignore */ }
          if (meta.type === "kronus-skill" && meta.skillConfig) {
            out.push({ slug: d.slug, title: d.title, summary: d.summary, config: meta.skillConfig as SkillConfig });
          }
        }
        out.sort((a, b) => a.title.localeCompare(b.title));
        setSkills(out);
        onSkillsLoaded?.(out);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "failed"))
      .finally(() => setLoading(false));
  }, [open, skills, onSkillsLoaded]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    const onScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onOpenChange, updatePosition]);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    // Delay adding the outside-click listener one tick so the opening click
    // doesn't immediately close the panel.
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const toggle = (slug: string) => {
    const set = new Set(activeSkillSlugs);
    if (set.has(slug)) set.delete(slug);
    else set.add(slug);
    onActiveSkillSlugsChange(Array.from(set));
  };

  return (
    <div ref={panelRef} className="hg-skills-popover" style={position ?? undefined}>
      <div className="hg-skills-popover-head">
        <span className="hg-skills-popover-title">skills</span>
        <span className="hg-skills-popover-count">
          {activeSkillSlugs.length} active · {skills?.length ?? 0} available
        </span>
      </div>
      <div className="hg-skills-popover-body">
        {loading && (
          <div className="hg-skills-popover-hint">
            <Loader2 className="animate-spin" size={12} /> loading skills
          </div>
        )}
        {error && <div className="hg-skills-popover-error">{error}</div>}
        {!loading && !error && skills && skills.length === 0 && (
          <div className="hg-skills-popover-hint">no skills defined yet</div>
        )}
        {skills && skills.map((s) => {
          const active = activeSkillSlugs.includes(s.slug);
          return (
            <button
              key={s.slug}
              type="button"
              className={`hg-skills-popover-row${active ? " hg-on" : ""}`}
              onClick={() => toggle(s.slug)}
            >
              <span className="hg-skills-popover-check">{active ? "✓" : ""}</span>
              <span className="hg-skills-popover-row-body">
                <span className="hg-skills-popover-row-title">{s.title}</span>
                {s.summary && (
                  <span className="hg-skills-popover-row-summary">{s.summary.slice(0, 100)}</span>
                )}
                {active && s.config && (
                  <span className="hg-skills-popover-row-adds">
                    adds {summarizeSkillAdds(s.config)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sync Library — fires Linear / Slite / Notion sync in parallel.
          Useful when external agents have added documents and Kronus
          needs to see them next turn. */}
      <div className="hg-skills-popover-foot">
        <button
          type="button"
          className="hg-skills-sync-btn"
          onClick={handleSyncLibrary}
          disabled={syncBusy}
          title="refresh Linear, Slite, and Notion caches"
        >
          {syncBusy ? <Loader2 className="animate-spin" size={12} /> : <RefreshCw size={12} />}
          <span>{syncBusy ? "syncing…" : "sync library"}</span>
        </button>
        {syncStatus && (
          <span className={`hg-skills-sync-status${syncStatus.ok ? " hg-on" : " hg-err"}`}>
            {syncStatus.ok ? <Check size={11} /> : <X size={11} />}
            {syncStatus.text}
          </span>
        )}
      </div>
    </div>
  );
}

function summarizeSkillAdds(config: SkillConfig): string {
  const soul = Object.entries(config.soul ?? {})
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  const tools = Object.entries(config.tools ?? {})
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  const parts = [
    ...soul.slice(0, 3).map((key) => `ctx:${key}`),
    ...tools.slice(0, 3).map((key) => `tool:${key}`),
  ];
  const remaining = Math.max(0, soul.length + tools.length - parts.length);
  if (parts.length === 0) return "skill prompt only";
  return `${parts.join(", ")}${remaining ? ` +${remaining}` : ""}`;
}
