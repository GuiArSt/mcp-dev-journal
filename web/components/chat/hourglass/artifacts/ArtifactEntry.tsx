"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactBodyEntry } from "./types";

interface Props {
  body: ArtifactBodyEntry;
}

/**
 * Compact journal-entry renderer for the shelf. Shows the four narrative
 * fields (why, what changed, decisions, kronus wisdom) plus a short
 * metadata header. Full entry remains accessible in the Reader page.
 */
export function ArtifactEntry({ body }: Props) {
  const sections: Array<{ key: string; label: string; text: string | undefined }> = [
    { key: "why", label: "Why", text: body.why },
    { key: "what", label: "What changed", text: body.whatChanged },
    { key: "decisions", label: "Decisions", text: body.decisions },
    { key: "wisdom", label: "Kronus wisdom", text: body.kronusWisdom },
  ];

  return (
    <div className="hg-artifact-entry">
      <header className="hg-artifact-entry-head">
        <div className="hg-artifact-entry-kind">journal entry</div>
        <div className="hg-artifact-entry-meta">
          <code>{body.commitHash.slice(0, 8)}</code> · {body.repository} · {body.branch} ·{" "}
          {new Date(body.date).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
      </header>
      {body.summary && <p className="hg-artifact-entry-summary">{body.summary}</p>}
      <div className="hg-artifact-entry-sections">
        {sections
          .filter((s) => s.text && s.text.trim().length > 0)
          .map((s) => (
            <section key={s.key} className="hg-artifact-entry-section">
              <h4>{s.label}</h4>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.text!}</ReactMarkdown>
            </section>
          ))}
      </div>
    </div>
  );
}
