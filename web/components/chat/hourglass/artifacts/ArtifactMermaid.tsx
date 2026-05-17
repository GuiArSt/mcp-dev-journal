"use client";

import { MermaidPreview } from "@/components/multimedia/MermaidPreview";
import type { ArtifactBodyMermaid } from "./types";

interface Props {
  body: ArtifactBodyMermaid;
}

/**
 * Standalone mermaid artifact — rendered from an entry_attachments blob
 * (filename .mmd / .mermaid). Uses the existing MermaidPreview component.
 */
export function ArtifactMermaid({ body }: Props) {
  return (
    <div className="hg-artifact-mermaid">
      <header className="hg-artifact-doc-head">
        <div className="hg-artifact-doc-type">mermaid</div>
        <h3 className="hg-artifact-doc-title">{body.filename}</h3>
      </header>
      <div className="hg-artifact-mermaid-body">
        <MermaidPreview code={body.code} />
      </div>
    </div>
  );
}
