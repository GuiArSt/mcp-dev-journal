"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";
import type { SoulConfigState } from "@/components/chat/SoulConfig";
import type { ToolsConfigState } from "@/components/chat/ToolsConfig";
import { ALL_SOUL_CONFIG, ALL_TOOLS_CONFIG, LEAN_SOUL_CONFIG, LEAN_TOOLS_CONFIG } from "@/lib/ai/skills";
import {
  estimateSoulContextTokens,
  formatTokenCount,
  formatTokenLabel,
  getSoulSectionCountAndTokens,
  mergeEffectiveSoulConfig,
  type KronusContextStats,
  type SoulContextSectionKey,
} from "@/lib/kronus-context-stats";
import { getModelContextLimit, DEFAULT_CHAT_MODEL } from "@/lib/ai/model-catalog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRect?: DOMRect | null;
  soulConfig: SoulConfigState;
  toolsConfig: ToolsConfigState;
  impliedSoulConfig?: Partial<SoulConfigState>;
  impliedToolsConfig?: Partial<ToolsConfigState>;
  onSoulConfigChange: (config: SoulConfigState) => void;
  onToolsConfigChange: (config: ToolsConfigState) => void;
  contextStats?: KronusContextStats | null;
  contextLimit?: number;
}

const SOUL_OPTIONS: Array<{ key: SoulContextSectionKey; label: string; hint: string }> = [
  { key: "writings", label: "writings", hint: "essays, poems, notes" },
  { key: "portfolioProjects", label: "portfolio", hint: "case studies" },
  { key: "skills", label: "cv skills", hint: "capability index" },
  { key: "workExperience", label: "experience", hint: "work history" },
  { key: "education", label: "education", hint: "academic history" },
  { key: "journalEntries", label: "journal", hint: "project memory" },
  { key: "chatIndex", label: "chat memory", hint: "session index" },
  { key: "linearProjects", label: "linear projects", hint: "project sync" },
  { key: "linearIssues", label: "linear issues", hint: "issue sync" },
  { key: "sliteNotes", label: "slite", hint: "knowledge notes" },
  { key: "notionPages", label: "notion", hint: "workspace pages" },
];

const TOOL_OPTIONS: Array<{ key: keyof ToolsConfigState; label: string; hint: string }> = [
  { key: "journal", label: "journal", hint: "entry/project tools" },
  { key: "repository", label: "library", hint: "docs, cv, registry" },
  { key: "cursorDelegate", label: "cursor", hint: "delegate local agent" },
  { key: "linear", label: "linear", hint: "issues/projects" },
  { key: "slite", label: "slite", hint: "knowledge base" },
  { key: "notion", label: "notion", hint: "workspace pages" },
  { key: "git", label: "git", hint: "repository reads" },
  { key: "media", label: "media", hint: "asset library" },
  { key: "imageGeneration", label: "image tools", hint: "chat image generation" },
  { key: "webSearch", label: "web", hint: "search tools" },
  { key: "google", label: "google", hint: "drive/mail/calendar" },
  { key: "memory", label: "memory", hint: "chat fetch/index" },
  { key: "aiIntegrations", label: "ai library", hint: "agent configs/logs" },
];

export function ConfigPopover({
  open,
  onOpenChange,
  anchorRect,
  soulConfig,
  toolsConfig,
  impliedSoulConfig,
  impliedToolsConfig,
  onSoulConfigChange,
  onToolsConfigChange,
  contextStats,
  contextLimit = getModelContextLimit(DEFAULT_CHAT_MODEL),
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const [localStats, setLocalStats] = useState<KronusContextStats | null>(null);

  const stats = contextStats ?? localStats;

  // Bootstrap stats once if parent has not loaded them yet.
  useEffect(() => {
    if (contextStats != null) return;
    let cancelled = false;
    fetch("/api/kronus/stats")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as KronusContextStats;
        if (!cancelled && typeof data.writings === "number") setLocalStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contextStats]);

  const effectiveSoul = useMemo(
    () => mergeEffectiveSoulConfig(soulConfig, impliedSoulConfig),
    [soulConfig, impliedSoulConfig],
  );

  const selectedSoulTokens = useMemo(() => {
    if (!stats) return null;
    return estimateSoulContextTokens(soulConfig, stats, impliedSoulConfig);
  }, [stats, soulConfig, impliedSoulConfig]);

  const soulContextPercent = selectedSoulTokens != null
    ? Math.min(99, Math.round((selectedSoulTokens / contextLimit) * 100))
    : null;

  const updatePosition = useCallback(() => {
    if (!anchorRect || typeof window === "undefined") {
      setPosition(null);
      return;
    }
    const panelWidth = 480;
    const margin = 12;
    const left = Math.max(
      margin,
      Math.min(anchorRect.left, window.innerWidth - panelWidth - margin),
    );
    const availableAbove = Math.max(260, anchorRect.top - margin * 2);
    setPosition({
      left,
      bottom: window.innerHeight - anchorRect.top + 8,
      maxHeight: Math.min(window.innerHeight * 0.76, availableAbove),
    });
  }, [anchorRect]);

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

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  const toggleSoul = (key: keyof SoulConfigState) => {
    onSoulConfigChange({ ...soulConfig, [key]: !soulConfig[key] });
  };
  const toggleTool = (key: keyof ToolsConfigState) => {
    onToolsConfigChange({ ...toolsConfig, [key]: !toolsConfig[key] });
  };

  return createPortal(
    <div ref={panelRef} className="hg-config-popover" style={position ?? undefined}>
      <div className="hg-config-popover-head">
        <span>context + tools</span>
        <span className="hg-config-head-meta">
          {countEffective(soulConfig, impliedSoulConfig)} context · {countEffective(toolsConfig, impliedToolsConfig)} tools
          {selectedSoulTokens != null ? <> · {formatTokenLabel(selectedSoulTokens)}</> : null}
        </span>
      </div>

      <div className="hg-config-popover-actions">
        <button type="button" onClick={() => { onSoulConfigChange(LEAN_SOUL_CONFIG); onToolsConfigChange(LEAN_TOOLS_CONFIG); }}>
          <RotateCcw size={12} /> lite
        </button>
        <button type="button" onClick={() => { onSoulConfigChange(ALL_SOUL_CONFIG); onToolsConfigChange(ALL_TOOLS_CONFIG); }}>
          full context
        </button>
      </div>

      <div className="hg-config-popover-grid">
        <section>
          <h4>soul context</h4>
          {SOUL_OPTIONS.map((option) => {
            const active = !!soulConfig[option.key];
            const skillActive = !active && !!impliedSoulConfig?.[option.key];
            const effectiveOn = !!effectiveSoul[option.key];
            const sectionStats = stats
              ? getSoulSectionCountAndTokens(option.key, stats, effectiveSoul)
              : null;

            return (
              <button
                key={option.key}
                type="button"
                className={`hg-config-row${active ? " hg-on" : ""}${skillActive ? " hg-skill-on" : ""}`}
                onClick={() => toggleSoul(option.key)}
                title={
                  sectionStats
                    ? `${formatTokenCount(sectionStats.tokens)} tokens if included (${sectionStats.count} items)`
                    : undefined
                }
              >
                <span className="hg-config-check">{active ? "✓" : skillActive ? "@" : ""}</span>
                <span className="hg-config-row-body">
                  <strong>{option.label}</strong>
                  {sectionStats && (
                    <span className="hg-config-row-stats">
                      {sectionStats.count} · {formatTokenLabel(sectionStats.tokens)}
                    </span>
                  )}
                  <em>
                    {skillActive
                      ? `${option.hint} · via skill`
                      : effectiveOn && !active
                        ? `${option.hint} · on via skill`
                        : option.hint}
                  </em>
                </span>
              </button>
            );
          })}
        </section>
        <section>
          <h4>tools</h4>
          {TOOL_OPTIONS.map((option) => {
            const active = !!toolsConfig[option.key];
            const skillActive = !active && !!impliedToolsConfig?.[option.key];
            return (
              <button
                key={option.key}
                type="button"
                className={`hg-config-row${active ? " hg-on" : ""}${skillActive ? " hg-skill-on" : ""}`}
                onClick={() => toggleTool(option.key)}
              >
                <span className="hg-config-check">{active ? "✓" : skillActive ? "@" : ""}</span>
                <span className="hg-config-row-body">
                  <strong>{option.label}</strong>
                  <em>{skillActive ? `${option.hint} · via skill` : option.hint}</em>
                </span>
              </button>
            );
          })}
        </section>
      </div>

      <footer className="hg-config-popover-foot">
        <div className="hg-config-foot-row">
          <span>selected context</span>
          <span>
            {selectedSoulTokens != null ? (
              <>
                <strong>{formatTokenLabel(selectedSoulTokens)}</strong>
                <span className="hg-config-foot-limit"> / {formatTokenCount(contextLimit)}</span>
                {soulContextPercent != null && (
                  <span className="hg-config-foot-pct"> ({soulContextPercent}%)</span>
                )}
              </>
            ) : (
              <span className="hg-config-foot-limit">calculating…</span>
            )}
          </span>
        </div>
        <div className="hg-config-foot-bar" aria-hidden>
          <div
            className="hg-config-foot-bar-fill"
            style={{ width: `${Math.min(soulContextPercent ?? 0, 100)}%` }}
          />
        </div>
        <p className="hg-config-foot-note">
          {stats
            ? `Base prompt ~${formatTokenCount(stats.baseTokens)} included. Per-row counts are what each section adds when on.`
            : "Loading context sizes from your library…"}
        </p>
      </footer>
    </div>,
    document.body,
  );
}

function countEffective(base: object, implied?: object): number {
  const keys = new Set([...Object.keys(base), ...Object.keys(implied ?? {})]);
  let count = 0;
  for (const key of keys) {
    if ((base as Record<string, unknown>)[key] || (implied as Record<string, unknown> | undefined)?.[key]) count += 1;
  }
  return count;
}
