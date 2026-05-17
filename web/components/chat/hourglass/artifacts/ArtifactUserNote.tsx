"use client";

import type { ArtifactBodyUserNote } from "./types";

interface Props {
  body: ArtifactBodyUserNote;
}

/**
 * Simple user-added note — a pinned text you showed to Kronus.
 */
export function ArtifactUserNote({ body }: Props) {
  return (
    <div className="hg-artifact-note">
      <header className="hg-artifact-note-head">
        <div className="hg-artifact-note-kind">note</div>
        <h3 className="hg-artifact-note-title">{body.title || "untitled"}</h3>
        <div className="hg-artifact-note-meta">
          added {new Date(body.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </div>
      </header>
      <div className="hg-artifact-note-body">
        {body.text.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </div>
  );
}
