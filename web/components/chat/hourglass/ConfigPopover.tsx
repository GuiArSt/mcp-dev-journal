"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";
import type { SoulConfigState } from "@/components/chat/SoulConfig";
import type { ToolsConfigState } from "@/components/chat/ToolsConfig";
import { ALL_SOUL_CONFIG, ALL_TOOLS_CONFIG, LEAN_SOUL_CONFIG, LEAN_TOOLS_CONFIG } from "@/lib/ai/skills";

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
}

const SOUL_OPTIONS: Array<{ key: keyof SoulConfigState; label: string; hint: string }> = [
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

function countEnabled(config: object): number {
  return Object.values(config).filter(Boolean).length;
}

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
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    if (!anchorRect || typeof window === "undefined") {
      setPosition(null);
      return;
    }
    const panelWidth = 420;
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
        <span>{countEffective(soulConfig, impliedSoulConfig)} context · {countEffective(toolsConfig, impliedToolsConfig)} tools</span>
      </div>

      <div className="hg-config-popover-actions">
        <button type="button" onClick={() => { onSoulConfigChange(LEAN_SOUL_CONFIG); onToolsConfigChange(LEAN_TOOLS_CONFIG); }}>
          <RotateCcw size={12} /> lean
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
            return (
              <button
                key={option.key}
                type="button"
                className={`hg-config-row${active ? " hg-on" : ""}${skillActive ? " hg-skill-on" : ""}`}
                onClick={() => toggleSoul(option.key)}
              >
                <span className="hg-config-check">{active ? "✓" : skillActive ? "@" : ""}</span>
                <span>
                  <strong>{option.label}</strong>
                  <em>{skillActive ? `${option.hint} · active via skill` : option.hint}</em>
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
                <span>
                  <strong>{option.label}</strong>
                  <em>{skillActive ? `${option.hint} · active via skill` : option.hint}</em>
                </span>
              </button>
            );
          })}
        </section>
      </div>
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
