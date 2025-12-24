"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import EntryEditor from "@/components/EntryEditor";
import KronusChat from "@/components/KronusChat";

interface JournalEntry {
  id: number;
  commit_hash: string;
  repository: string;
  branch: string;
  author: string;
  date: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
  raw_agent_report: string;
  created_at: string;
  attachments?: Array<{
    id: number;
    filename: string;
    mime_type: string;
    description: string | null;
    file_size: number;
  }>;
}

export default function EntryPage() {
  const router = useRouter();
  const params = useParams();
  const commitHash = params.commitHash as string;

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState<"view" | "edit" | "kronus">("view");

  useEffect(() => {
    fetchEntry();
  }, [commitHash]);

  const fetchEntry = async () => {
    try {
      const response = await fetch(`/api/entries/${commitHash}`);
      if (response.ok) {
        const data = await response.json();
        setEntry(data);
      } else {
        router.push("/");
      }
    } catch (error) {
      console.error("Failed to fetch entry:", error);
      router.push("/");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (updates: Partial<JournalEntry>) => {
    try {
      const response = await fetch(`/api/entries/${commitHash}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const updated = await response.json();
        setEntry(updated);
        setEditMode("view");
      }
    } catch (error) {
      console.error("Failed to update entry:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--tartarus-void)]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--tartarus-teal)]"></div>
          <p className="mt-4 text-[var(--tartarus-ivory-muted)]">Loading entry...</p>
        </div>
      </div>
    );
  }

  if (!entry) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--tartarus-void)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/reader")}
              className="flex items-center gap-2 text-[var(--tartarus-teal)] hover:text-[var(--tartarus-teal-bright)]"
            >
              ← Back to Journal
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setEditMode("view")}
                className={`rounded-lg px-4 py-2 transition-colors ${
                  editMode === "view"
                    ? "bg-[var(--tartarus-teal)] text-[var(--tartarus-void)]"
                    : "bg-[var(--tartarus-elevated)] text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-border)]"
                }`}
              >
                View
              </button>
              <button
                onClick={() => setEditMode("edit")}
                className={`rounded-lg px-4 py-2 transition-colors ${
                  editMode === "edit"
                    ? "bg-[var(--tartarus-teal)] text-[var(--tartarus-void)]"
                    : "bg-[var(--tartarus-elevated)] text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-border)]"
                }`}
              >
                Edit
              </button>
              <button
                onClick={() => setEditMode("kronus")}
                className={`rounded-lg px-4 py-2 transition-colors ${
                  editMode === "kronus"
                    ? "bg-[var(--tartarus-gold)] text-[var(--tartarus-void)]"
                    : "bg-[var(--tartarus-elevated)] text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-border)]"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <img src="/chronus-logo.png" alt="" className="h-4 w-4 rounded-full" />
                  Kronus
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {editMode === "view" && (
          <div className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-8">
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-3">
                <h1 className="text-2xl font-bold text-[var(--tartarus-ivory)]">{entry.repository}</h1>
                <span className="text-[var(--tartarus-ivory-faded)]">/</span>
                <span className="text-[var(--tartarus-ivory-muted)]">{entry.branch}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-[var(--tartarus-ivory-faded)]">
                <span className="font-mono text-[var(--tartarus-teal)]">{entry.commit_hash}</span>
                <span>•</span>
                <span>{entry.author}</span>
                <span>•</span>
                <span>{new Date(entry.date).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-6">
              <section>
                <h2 className="mb-2 text-lg font-semibold text-[var(--tartarus-teal)]">Why</h2>
                <div className="prose prose-sm prose-invert max-w-none prose-headings:text-[var(--tartarus-ivory)] prose-p:text-[var(--tartarus-ivory-muted)] prose-strong:text-[var(--tartarus-ivory)] prose-code:text-[var(--tartarus-teal)] prose-code:bg-[var(--tartarus-elevated)] prose-code:px-1 prose-code:rounded prose-pre:bg-[var(--tartarus-deep)] prose-pre:text-[var(--tartarus-ivory-dim)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.why}</ReactMarkdown>
                </div>
              </section>

              <section>
                <h2 className="mb-2 text-lg font-semibold text-[var(--tartarus-teal)]">What Changed</h2>
                <div className="prose prose-sm prose-invert max-w-none prose-headings:text-[var(--tartarus-ivory)] prose-p:text-[var(--tartarus-ivory-muted)] prose-strong:text-[var(--tartarus-ivory)] prose-code:text-[var(--tartarus-teal)] prose-code:bg-[var(--tartarus-elevated)] prose-code:px-1 prose-code:rounded prose-pre:bg-[var(--tartarus-deep)] prose-pre:text-[var(--tartarus-ivory-dim)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.what_changed}</ReactMarkdown>
                </div>
              </section>

              <section>
                <h2 className="mb-2 text-lg font-semibold text-[var(--tartarus-teal)]">Decisions</h2>
                <div className="prose prose-sm prose-invert max-w-none prose-headings:text-[var(--tartarus-ivory)] prose-p:text-[var(--tartarus-ivory-muted)] prose-strong:text-[var(--tartarus-ivory)] prose-code:text-[var(--tartarus-teal)] prose-code:bg-[var(--tartarus-elevated)] prose-code:px-1 prose-code:rounded prose-pre:bg-[var(--tartarus-deep)] prose-pre:text-[var(--tartarus-ivory-dim)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.decisions}</ReactMarkdown>
                </div>
              </section>

              <section>
                <h2 className="mb-2 text-lg font-semibold text-[var(--tartarus-teal)]">Technologies</h2>
                <div className="prose prose-sm prose-invert max-w-none prose-headings:text-[var(--tartarus-ivory)] prose-p:text-[var(--tartarus-ivory-muted)] prose-strong:text-[var(--tartarus-ivory)] prose-code:text-[var(--tartarus-teal)] prose-code:bg-[var(--tartarus-elevated)] prose-code:px-1 prose-code:rounded prose-pre:bg-[var(--tartarus-deep)] prose-pre:text-[var(--tartarus-ivory-dim)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.technologies}</ReactMarkdown>
                </div>
              </section>

              {entry.kronus_wisdom && (
                <section className="rounded-lg border border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-gold-soft)] p-4">
                  <h2 className="mb-2 text-lg font-semibold text-[var(--tartarus-gold)]">Kronus Wisdom</h2>
                  <div className="prose prose-sm prose-invert max-w-none prose-headings:text-[var(--tartarus-gold)] prose-p:text-[var(--tartarus-ivory-dim)] prose-p:italic prose-strong:text-[var(--tartarus-gold)] prose-code:text-[var(--tartarus-gold)] prose-code:bg-[var(--tartarus-elevated)] prose-code:px-1 prose-code:rounded">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.kronus_wisdom}</ReactMarkdown>
                  </div>
                </section>
              )}

              {entry.attachments && entry.attachments.length > 0 && (
                <section>
                  <h2 className="mb-2 text-lg font-semibold text-[var(--tartarus-teal)]">Attachments</h2>
                  <div className="space-y-2">
                    {entry.attachments.map((att) => (
                      <div key={att.id} className="flex items-center gap-2 text-sm text-[var(--tartarus-ivory-muted)]">
                        <span>📎</span>
                        <span className="text-[var(--tartarus-ivory)]">{att.filename}</span>
                        <span className="text-[var(--tartarus-ivory-faded)]">
                          ({(att.file_size / 1024).toFixed(2)} KB)
                        </span>
                        {att.description && (
                          <span className="text-[var(--tartarus-ivory-muted)]">- {att.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {editMode === "edit" && (
          <EntryEditor entry={entry} onUpdate={handleUpdate} onCancel={() => setEditMode("view")} />
        )}

        {editMode === "kronus" && <KronusChat entry={entry} onUpdate={handleUpdate} />}
      </main>
    </div>
  );
}
