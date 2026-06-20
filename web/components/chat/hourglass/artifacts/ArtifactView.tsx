"use client";

import { ArtifactImage } from "./ArtifactImage";
import { ArtifactPoem } from "./ArtifactPoem";
import { ArtifactDocument } from "./ArtifactDocument";
import { ArtifactEntry } from "./ArtifactEntry";
import { ArtifactUserNote } from "./ArtifactUserNote";
import { ArtifactMermaid } from "./ArtifactMermaid";
import { ArtifactProjectSummary } from "./ArtifactProjectSummary";
import type { Artifact } from "./types";

interface Props {
  artifact: Artifact;
  rendering?: boolean;
  onEditImage?: () => void;
  editPopover?: React.ReactNode;
}

/**
 * Dispatcher: renders any artifact kind. Non-image kinds do NOT get the
 * runic image frame — they have their own layout.
 */
export function ArtifactView({ artifact, rendering = false, onEditImage, editPopover }: Props) {
  const { body, turnIndex, title } = artifact;
  switch (body.kind) {
    case "muse-image":
    case "media":
      return (
        <ArtifactImage
          body={body}
          title={title}
          turnIndex={turnIndex}
          rendering={rendering}
          onEditClick={onEditImage}
          editPopover={editPopover}
        />
      );
    case "muse-poem":
      return <ArtifactPoem body={body} turnIndex={turnIndex} />;
    case "document":
      return <ArtifactDocument body={body} />;
    case "journal-entry":
      return <ArtifactEntry body={body} />;
    case "user-note":
      return <ArtifactUserNote body={body} />;
    case "mermaid":
      return <ArtifactMermaid body={body} />;
    case "project-summary":
      return <ArtifactProjectSummary body={body} />;
    default: {
      // Exhaustiveness
      const _exhaustive: never = body;
      return <div className="hg-artifact-unknown">unknown artifact kind</div>;
    }
  }
}
