"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactBodyProjectSummary } from "./types";

interface Props {
  body: ArtifactBodyProjectSummary;
}

/**
 * Read-only project-summary renderer for the shelf. Lighter than the full
 * ProjectSummaryCard (which has edit/analyze/delete actions) — just the
 * fields that help Kronus ground himself in a repo.
 */
export function ArtifactProjectSummary({ body }: Props) {
  const sections: Array<{ key: keyof ArtifactBodyProjectSummary; label: string }> = [
    { key: "purpose", label: "Purpose" },
    { key: "architecture", label: "Architecture" },
    { key: "techStack", label: "Tech stack" },
  ];

  return (
    <div className="hg-artifact-project">
      <header className="hg-artifact-doc-head">
        <div className="hg-artifact-doc-type">Repository overview</div>
        <h2 className="hg-artifact-doc-title">{body.repository}</h2>
        {body.status && (
          <span className="hg-artifact-tag hg-artifact-project-status">{body.status}</span>
        )}
      </header>
      {body.summary && (
        <p className="hg-artifact-doc-summary">{body.summary}</p>
      )}
      <div className="hg-artifact-doc-body">
        {sections
          .filter((s) => typeof body[s.key] === "string" && (body[s.key] as string).trim().length > 0)
          .map((s) => (
            <section key={s.key as string} className="hg-artifact-entry-section">
              <h4>{s.label}</h4>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body[s.key] as string}</ReactMarkdown>
            </section>
          ))}
      </div>
    </div>
  );
}
