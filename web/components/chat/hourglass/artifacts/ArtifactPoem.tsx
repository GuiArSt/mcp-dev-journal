"use client";

import type { ArtifactBodyPoem } from "./types";

interface Props {
  body: ArtifactBodyPoem;
  turnIndex?: number;
}

/**
 * Poem card — Cormorant serif, indented cascade. The muse's literary
 * output. No image, just text on the runic backdrop.
 */
export function ArtifactPoem({ body, turnIndex }: Props) {
  return (
    <div className="hg-artifact-poem">
      <div className="hg-artifact-poem-head">
        <span className="hg-glyph">✦</span>
        <span className="hg-artifact-poem-title">{body.title}</span>
        {turnIndex != null && (
          <span className="hg-artifact-poem-turn">turn {String(turnIndex).padStart(2, "0")}</span>
        )}
      </div>
      <div className="hg-poem">
        {body.lines.map((line, i) => (
          <div key={i} className="hg-line">
            {line}
          </div>
        ))}
      </div>
      {body.reason && (
        <div className="hg-artifact-poem-reason">
          <span className="hg-muse-note-lbl">✦ the muse says</span>
          <span className="hg-artifact-poem-reason-body">{body.reason}</span>
        </div>
      )}
    </div>
  );
}
