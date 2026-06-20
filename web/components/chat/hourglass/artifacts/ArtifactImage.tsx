"use client";

import { Sparkles } from "lucide-react";
import type { ArtifactBodyMuseImage, ArtifactBodyMedia } from "./types";
import { formatBeatPadded } from "../hourglass-ui";

interface Props {
  body: ArtifactBodyMuseImage | ArtifactBodyMedia;
  title: string;
  turnIndex?: number;
  rendering?: boolean;
  /** When set, the image becomes clickable and a muse glyph appears in the
   *  corner. Both call this handler — used to open the muse edit popover. */
  onEditClick?: () => void;
  /** Popover element rendered inside the figure when open. */
  editPopover?: React.ReactNode;
}

/**
 * Renders a rendered/uploaded image. Muse images may carry a companion
 * poem — when present, it renders in a card below the image (original
 * hourglass pairing).
 */
export function ArtifactImage({ body, title, turnIndex, rendering = false, onEditClick, editPopover }: Props) {
  const isMuse = body.kind === "muse-image";
  const caption = isMuse
    ? body.prompt
    : body.description || body.alt || undefined;
  const meta = isMuse
    ? `${body.renderMode ?? "mood"}${body.model ? ` · ${body.model}` : ""}`
    : body.prompt || body.model || undefined;
  const companionPoem = isMuse ? body.companionPoem : undefined;
  const beatLabel = turnIndex != null ? `beat ${formatBeatPadded(turnIndex)}` : null;

  const clickable = Boolean(onEditClick);

  return (
    <div className="hg-artifact-image-stack">
      <figure className="hg-artifact-hero" aria-label={beatLabel ?? title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`hg-mood-image${clickable ? " hg-mood-image-clickable" : ""}`}
          src={body.imageUrl}
          alt={title}
          aria-label={title}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? onEditClick : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEditClick?.();
                  }
                }
              : undefined
          }
          title={clickable ? "click to ask the muse for an edit" : undefined}
        />
        <div className="hg-overlay-badge">
          {beatLabel ?? title}
          {meta ? ` · ${meta}` : ""}
        </div>
        {onEditClick && (
          <button
            type="button"
            className="hg-muse-edit-btn"
            onClick={(e) => { e.stopPropagation(); onEditClick(); }}
            aria-label="ask the muse for an edit"
            title="ask the muse for an edit"
          >
            <Sparkles size={13} />
          </button>
        )}
        {rendering && (
          <div className="hg-muse-rendering-overlay" role="status" aria-live="polite">
            <div className="hg-muse-rendering-orb" />
            <div className="hg-muse-rendering-scan" />
            <div className="hg-muse-rendering-copy">
              <span>the muse is preparing the visual</span>
              <em>the current image stays until the replacement is ready</em>
            </div>
          </div>
        )}
        {editPopover}
      </figure>

      {(caption || meta) && (
        <div className="hg-artifact-caption-card">
          {meta && <div className="hg-artifact-caption-meta">{meta}</div>}
          {caption && (
            <div className="hg-artifact-caption-text">
              &quot;{caption.length > 160 ? `${caption.slice(0, 160)}...` : caption}&quot;
            </div>
          )}
        </div>
      )}

      {companionPoem && (
        <div className="hg-artifact-companion-poem">
          <div className="hg-artifact-companion-head">
            <span className="hg-glyph">✦</span>
            <span className="hg-artifact-companion-title">{companionPoem.title}</span>
          </div>
          <div className="hg-poem">
            {companionPoem.lines.map((line, i) => (
              <div key={i} className="hg-line">{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
