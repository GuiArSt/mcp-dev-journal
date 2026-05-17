"use client";

import { Loader2, Palette, RefreshCw, X } from "lucide-react";

interface PendingProposal {
  id: string;
  action: "new" | "refine";
  targetUuid?: string | null;
  renderMode: "mood" | "infographic";
  prompt: string;
  reason: string;
  turnIndex: number;
}

interface Props {
  proposal: PendingProposal;
  busy: boolean;
  onAccept: () => void;
  onSkip: () => void;
}

/**
 * Card that surfaces a pending muse proposal in the right panel.
 * The muse proposes; the user confirms before any image is rendered.
 */
export function ProposalCard({ proposal, busy, onAccept, onSkip }: Props) {
  const ActionIcon = proposal.action === "refine" ? RefreshCw : Palette;
  const actionLabel = proposal.action === "refine" ? "refine current" : "new image";
  return (
    <div className="hg-proposal-card">
      <div className="hg-proposal-head">
        <span className="hg-proposal-glyph">✦</span>
        <span className="hg-proposal-kind">
          the muse proposes
          <span className="hg-proposal-tag">{proposal.renderMode}</span>
          <span className="hg-proposal-tag hg-proposal-tag-action">
            <ActionIcon size={10} /> {actionLabel}
          </span>
        </span>
      </div>
      <div className="hg-proposal-reason">{proposal.reason}</div>
      <div className="hg-proposal-prompt" title={proposal.prompt}>
        {proposal.prompt}
      </div>
      <div className="hg-proposal-actions">
        <button
          type="button"
          className="hg-proposal-accept"
          onClick={onAccept}
          disabled={busy}
          title="render the proposal"
        >
          {busy ? <Loader2 className="animate-spin" size={13} /> : <Palette size={13} />}
          <span>{busy ? "rendering..." : "accept"}</span>
        </button>
        <button
          type="button"
          className="hg-proposal-skip"
          onClick={onSkip}
          disabled={busy}
          title="skip this proposal"
        >
          <X size={13} />
          <span>skip</span>
        </button>
      </div>
    </div>
  );
}
