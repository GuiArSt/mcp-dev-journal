"use client";

import { Loader2, Palette, RefreshCw, X, Image as ImageIcon, Layers, Sparkles } from "lucide-react";
import type { ArtifactRef } from "./artifacts/types";

/**
 * The single approval surface for every Muse image in the Hourglass.
 *
 * Three modes:
 *   • "single"        — one proposal card; accept/skip
 *   • "alternatives"  — N variants picker; pick one or skip all
 *   • "direct"        — Kronus's `generate_image` brought a fully-formed
 *                       prompt; user confirms before rendering
 *
 * No image is rendered without explicit user accept. There is no `auto: true`
 * bypass — Kronus tools always route through this surface.
 */

export interface PendingApprovalAlternative {
  label: string;
  visualForm?: string | null;
  renderMode: "mood" | "infographic";
  prompt: string;
  rationale: string;
}

/** Kronus's direct-image fields, surfaced verbatim for trust/transparency. */
export interface DirectKronusContext {
  /** "openai" | "google" | etc. — what provider Kronus picked. */
  provider?: string;
  /** Specific model id when the tool used one. */
  model?: string;
  /** Free-form style hint Kronus passed (e.g. "comic strip"). */
  styleHint?: string;
  /** Linkage Kronus suggested — shown as a chip so the user sees what it'll attach to. */
  linked?: ArtifactRef["linked"];
}

export interface PendingApproval {
  id: string;
  mode: "single" | "alternatives" | "direct";
  /** Always present — the muse's reason, OR Kronus's intent for direct mode. */
  reason: string;
  /** Captured at creation so accepts re-stamp the right turn. */
  turnIndex: number;

  // single-mode fields
  action?: "new" | "refine";
  targetUuid?: string | null;
  renderMode?: "mood" | "infographic";
  prompt?: string;

  // alternatives-mode fields
  alternatives?: PendingApprovalAlternative[];

  // direct-mode (Kronus tool) fields
  direct?: DirectKronusContext;
}

interface Props {
  approval: PendingApproval;
  busy: boolean;
  /** For single + direct: accept the one offer. */
  onAccept?: () => void;
  /** For alternatives: pick one by index. */
  onPick?: (index: number) => void;
  /** Always present: dismiss without rendering. */
  onSkip: () => void;
}

export function ApprovalCard({ approval, busy, onAccept, onPick, onSkip }: Props) {
  if (approval.mode === "alternatives" && approval.alternatives?.length) {
    return (
      <div className="hg-approval hg-approval-picker">
        <Header
          title={`the muse offers ${approval.alternatives.length} options`}
          subtitle={approval.reason}
          tone="muse"
        />
        <div className="hg-approval-alts">
          {approval.alternatives.map((alt, i) => {
            const Icon = alt.renderMode === "infographic" ? Layers : ImageIcon;
            return (
              <button
                key={i}
                type="button"
                className="hg-approval-alt"
                onClick={() => onPick?.(i)}
                disabled={busy}
              >
                <div className="hg-approval-alt-head">
                  <Icon size={11} />
                  <span className="hg-approval-alt-label">{alt.label}</span>
                  <span className="hg-approval-tag">{alt.visualForm ?? alt.renderMode}</span>
                </div>
                <div className="hg-approval-alt-rationale">{alt.rationale}</div>
                <div className="hg-approval-alt-prompt" title={alt.prompt}>
                  {alt.prompt}
                </div>
                <div className="hg-approval-alt-foot">
                  {busy ? (
                    <><Loader2 className="animate-spin" size={11} /> rendering...</>
                  ) : (
                    <><Palette size={11} /> render this</>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <Actions onSkip={onSkip} busy={busy} skipLabel="skip all" />
      </div>
    );
  }

  if (approval.mode === "direct" && approval.prompt && approval.renderMode) {
    const direct = approval.direct ?? {};
    return (
      <div className="hg-approval hg-approval-direct">
        <Header
          title="Kronus is asking for an image"
          subtitle={approval.reason || "Kronus has prepared a prompt for you to confirm."}
          tone="kronus"
        />
        <div className="hg-approval-meta">
          <span className="hg-approval-tag">{approval.renderMode}</span>
          {direct.provider && <span className="hg-approval-tag">{direct.provider}</span>}
          {direct.model && <span className="hg-approval-tag">{direct.model}</span>}
          {direct.styleHint && <span className="hg-approval-tag hg-approval-tag-style">{direct.styleHint}</span>}
          {direct.linked && (
            <span className="hg-approval-tag hg-approval-tag-link">
              {direct.linked.kind === "journal" ? "📜"
                : direct.linked.kind === "document" ? "📄"
                : "🎨"}
              <span className="hg-approval-tag-label">
                {direct.linked.title?.slice(0, 28) ?? direct.linked.sourceId.slice(0, 12)}
              </span>
            </span>
          )}
        </div>
        <div className="hg-approval-prompt" title={approval.prompt}>{approval.prompt}</div>
        <Actions onAccept={onAccept} onSkip={onSkip} busy={busy} acceptLabel="render" skipLabel="skip" />
      </div>
    );
  }

  // Default: single proposal mode
  if (approval.prompt && approval.renderMode && approval.action) {
    const ActionIcon = approval.action === "refine" ? RefreshCw : Palette;
    const actionLabel = approval.action === "refine" ? "refine current" : "new image";
    return (
      <div className="hg-approval hg-approval-single">
        <Header
          title="the muse proposes"
          subtitle={approval.reason}
          tone="muse"
          extraTags={
            <>
              <span className="hg-approval-tag">{approval.renderMode}</span>
              <span className="hg-approval-tag hg-approval-tag-action">
                <ActionIcon size={10} /> {actionLabel}
              </span>
            </>
          }
        />
        <div className="hg-approval-prompt" title={approval.prompt}>{approval.prompt}</div>
        <Actions onAccept={onAccept} onSkip={onSkip} busy={busy} acceptLabel="accept" skipLabel="skip" />
      </div>
    );
  }

  // Malformed — show the reason as a fallback so we never silently swallow.
  return (
    <div className="hg-approval hg-approval-single">
      <Header title="approval pending" subtitle={approval.reason || "(no detail)"} tone="muse" />
      <Actions onSkip={onSkip} busy={busy} skipLabel="dismiss" />
    </div>
  );
}

// ─── tiny internals ─────────────────────────────────────────────────────

function Header({
  title,
  subtitle,
  tone,
  extraTags,
}: {
  title: string;
  subtitle?: string;
  tone: "muse" | "kronus";
  extraTags?: React.ReactNode;
}) {
  return (
    <div className="hg-approval-head">
      <span className={`hg-approval-glyph hg-approval-glyph-${tone}`}>
        {tone === "muse" ? <Sparkles size={12} /> : <Palette size={12} />}
      </span>
      <span className="hg-approval-title">
        {title}
        {extraTags}
      </span>
      {subtitle && <div className="hg-approval-reason">{subtitle}</div>}
    </div>
  );
}

function Actions({
  onAccept,
  onSkip,
  busy,
  acceptLabel,
  skipLabel,
}: {
  onAccept?: () => void;
  onSkip: () => void;
  busy: boolean;
  acceptLabel?: string;
  skipLabel: string;
}) {
  return (
    <div className="hg-approval-actions">
      {onAccept && (
        <button
          type="button"
          className="hg-approval-accept"
          onClick={onAccept}
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" size={13} /> : <Palette size={13} />}
          <span>{busy ? "rendering..." : (acceptLabel ?? "accept")}</span>
        </button>
      )}
      <button
        type="button"
        className="hg-approval-skip"
        onClick={onSkip}
        disabled={busy}
      >
        <X size={13} />
        <span>{skipLabel}</span>
      </button>
    </div>
  );
}
