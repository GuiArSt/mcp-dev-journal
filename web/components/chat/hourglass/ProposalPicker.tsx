"use client";

import { Loader2, Palette, X, Image as ImageIcon, Layers } from "lucide-react";

interface PendingProposalAlternative {
  label: string;
  visualForm?: string | null;
  renderMode: "mood" | "infographic";
  prompt: string;
  rationale: string;
}

interface Props {
  alternatives: PendingProposalAlternative[];
  reason: string;
  busy: boolean;
  busyIndex: number | null;
  onPick: (index: number) => void;
  onSkip: () => void;
}

/**
 * Multi-alternative picker — shown when the muse returns N proposals
 * (typically 4) for the user to choose from. Triggered by the composer's
 * visual button via `mode: "propose", mandatory: true, alternatives: 4`.
 */
export function ProposalPicker({ alternatives, reason, busy, busyIndex, onPick, onSkip }: Props) {
  return (
    <div className="hg-proposal-picker">
      <div className="hg-proposal-picker-head">
        <span className="hg-proposal-glyph">✦</span>
        <span className="hg-proposal-picker-title">
          the muse offers {alternatives.length} options
        </span>
      </div>
      {reason && <div className="hg-proposal-reason">{reason}</div>}
      <div className="hg-proposal-picker-list">
        {alternatives.map((alt, i) => {
          const Icon = alt.renderMode === "infographic" ? Layers : ImageIcon;
          const isThisBusy = busy && busyIndex === i;
          return (
            <button
              key={i}
              type="button"
              className="hg-proposal-alt"
              onClick={() => onPick(i)}
              disabled={busy}
              title="render this variant"
            >
              <div className="hg-proposal-alt-head">
                <Icon size={11} />
                <span className="hg-proposal-alt-label">{alt.label}</span>
                <span className="hg-proposal-tag">{alt.visualForm ?? alt.renderMode}</span>
              </div>
              <div className="hg-proposal-alt-rationale">{alt.rationale}</div>
              <div className="hg-proposal-alt-prompt" title={alt.prompt}>
                {alt.prompt}
              </div>
              <div className="hg-proposal-alt-foot">
                {isThisBusy ? (
                  <>
                    <Loader2 className="animate-spin" size={11} /> rendering...
                  </>
                ) : (
                  <>
                    <Palette size={11} /> render this
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="hg-proposal-actions">
        <button
          type="button"
          className="hg-proposal-skip"
          onClick={onSkip}
          disabled={busy}
        >
          <X size={13} />
          <span>skip all</span>
        </button>
      </div>
    </div>
  );
}
