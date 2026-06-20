"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

interface Props {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  sourceTitle?: string;
  error?: string | null;
}

/**
 * Floating prompt input over the displayed image. The muse receives the
 * current image + the prompt and produces a mutation via /muse/edit. v1
 * is single-shot — the new image lands on the shelf as a separate entry
 * tagged `muse-edited`, preserving the original.
 */
export function MuseEditPopover({ open, busy, onClose, onSubmit, sourceTitle, error }: Props) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => textareaRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) setDraft("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  return (
    <div
      className="hg-muse-edit-pop"
      role="dialog"
      aria-label="Ask the muse for an image edit"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="hg-muse-edit-pop-head">
        <span className="hg-muse-edit-pop-glyph">✦</span>
        <span className="hg-muse-edit-pop-title">ask the muse</span>
        {sourceTitle && (
          <span className="hg-muse-edit-pop-target" title={sourceTitle}>
            {sourceTitle.length > 38 ? `${sourceTitle.slice(0, 36)}…` : sourceTitle}
          </span>
        )}
        <button
          className="hg-muse-edit-pop-close"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="hg-muse-edit-pop-input"
        placeholder="describe the change… e.g. soften the palette, add a second figure, render as inkwash"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
            e.preventDefault();
            onSubmit(trimmed);
          }
        }}
      />

      {error && <div className="hg-muse-edit-pop-error">{error}</div>}

      <div className="hg-muse-edit-pop-foot">
        <span className="hg-muse-edit-pop-hint">⌘+enter to send</span>
        <button
          className="hg-muse-edit-pop-submit"
          onClick={() => canSubmit && onSubmit(trimmed)}
          disabled={!canSubmit}
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" size={13} /> rendering
            </>
          ) : (
            <>mutate</>
          )}
        </button>
      </div>
    </div>
  );
}
