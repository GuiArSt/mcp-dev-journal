"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { ChatModelOption } from "./Composer";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  chatModel: string;
  chatModels: ChatModelOption[];
  onChatModelChange: (key: string) => void;
  imagesEnabled: boolean;
  onToggleImages: () => void;
  imagesProvider: "google" | "openai";
  onImagesProviderChange: (p: "google" | "openai") => void;
}

/**
 * Combined chat + image model selector. Mirrors the lightweight
 * SkillsPopover pattern (no shadcn dep, just an absolutely-positioned
 * panel).
 *
 *  ┌──────────────────────────┐
 *  │ chat                     │
 *  │  ◉ Claude Opus 4.7       │
 *  │  ○ Gemini 3.1 Pro        │
 *  │  ...                     │
 *  │                          │
 *  │ image                    │
 *  │  [×] Images in chat      │
 *  │  ◉ Gemini ◯ GPT          │
 *  └──────────────────────────┘
 */
export function ModelsPopover({
  open,
  onOpenChange,
  anchorRef,
  chatModel,
  chatModels,
  onChatModelChange,
  imagesEnabled,
  onToggleImages,
  imagesProvider,
  onImagesProviderChange,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === "undefined") return;
    const rect = anchor.getBoundingClientRect();
    const panelWidth = 320;
    const margin = 12;
    const left = Math.max(
      margin,
      Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - margin),
    );
    const availableAbove = Math.max(220, rect.top - margin * 2);
    setPosition({
      left,
      bottom: window.innerHeight - rect.top + 8,
      maxHeight: Math.min(window.innerHeight * 0.72, availableAbove),
    });
  }, [anchorRef]);

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

  // Outside-click + Esc.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
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
  }, [open, onOpenChange, anchorRef]);

  if (!open) return null;

  if (typeof document === "undefined") return null;
  if (!position) return null;

  return createPortal(
    <div ref={panelRef} className="hg-models-popover" style={position}>
      <div className="hg-models-popover-section">
        <div className="hg-models-popover-head">chat</div>
        {chatModels.map((m) => {
          const active = m.key === chatModel;
          return (
            <button
              key={m.key}
              type="button"
              className={`hg-models-popover-row${active ? " hg-on" : ""}`}
              onClick={() => onChatModelChange(m.key)}
            >
              <span className="hg-models-popover-radio">{active ? "●" : "○"}</span>
              <span className="hg-models-popover-row-body">
                <span className="hg-models-popover-row-title">{m.label}</span>
                <span className="hg-models-popover-row-meta">{m.provider}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="hg-models-popover-divider" />

      <div className="hg-models-popover-section">
        <div className="hg-models-popover-head">image</div>
        <button
          type="button"
          className={`hg-models-popover-row hg-toggle${imagesEnabled ? " hg-on" : ""}`}
          onClick={onToggleImages}
        >
          <span className="hg-models-popover-check">{imagesEnabled ? "✓" : ""}</span>
          <span className="hg-models-popover-row-body">
            <span className="hg-models-popover-row-title">images in chat</span>
            <span className="hg-models-popover-row-meta">inline images in the Kronos stream via tools</span>
          </span>
        </button>
        {imagesEnabled && (
          <div className="hg-models-popover-subgroup">
            <button
              type="button"
              className={`hg-models-popover-row${imagesProvider === "google" ? " hg-on" : ""}`}
              onClick={() => onImagesProviderChange("google")}
            >
              <span className="hg-models-popover-radio">{imagesProvider === "google" ? "●" : "○"}</span>
              <span className="hg-models-popover-row-body">
                <span className="hg-models-popover-row-title">Gemini · Nano Banana</span>
                <span className="hg-models-popover-row-meta">native image output</span>
              </span>
            </button>
            <button
              type="button"
              className={`hg-models-popover-row${imagesProvider === "openai" ? " hg-on" : ""}`}
              onClick={() => onImagesProviderChange("openai")}
            >
              <span className="hg-models-popover-radio">{imagesProvider === "openai" ? "●" : "○"}</span>
              <span className="hg-models-popover-row-body">
                <span className="hg-models-popover-row-title">GPT Image 2</span>
                <span className="hg-models-popover-row-meta">best for text + infographics</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
