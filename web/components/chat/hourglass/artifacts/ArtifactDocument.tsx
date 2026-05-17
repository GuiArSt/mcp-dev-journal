"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidPreview } from "@/components/multimedia/MermaidPreview";
import type { ArtifactBodyDocument } from "./types";

interface Props {
  body: ArtifactBodyDocument;
}

/**
 * Document renderer. Handles writing/prompt/note. Custom markdown `code`
 * component detects ```mermaid blocks and swaps them for live diagrams.
 */
export function ArtifactDocument({ body }: Props) {
  return (
    <div className="hg-artifact-doc">
      <header className="hg-artifact-doc-head">
        <div className="hg-artifact-doc-type">{body.documentType}</div>
        <h2 className="hg-artifact-doc-title">{body.title}</h2>
        {body.summary && <p className="hg-artifact-doc-summary">{body.summary}</p>}
        {body.tags && body.tags.length > 0 && (
          <div className="hg-artifact-doc-tags">
            {body.tags.map((t) => (
              <span key={t} className="hg-artifact-tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </header>
      <div className="hg-artifact-doc-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children }) {
              const match = /language-(\w+)/.exec(className || "");
              const lang = match?.[1];
              const raw = String(children ?? "").replace(/\n$/, "");
              if (lang === "mermaid") {
                return <MermaidPreview code={raw} className="hg-mermaid-embed" />;
              }
              return <code className={className}>{children}</code>;
            },
          }}
        >
          {body.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
