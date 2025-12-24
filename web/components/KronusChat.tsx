"use client";

import { useState } from "react";

interface JournalEntry {
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
}

interface KronusChatProps {
  entry: JournalEntry;
  onUpdate: (updates: Partial<JournalEntry>) => Promise<void>;
}

export default function KronusChat({ entry, onUpdate }: KronusChatProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Partial<JournalEntry> | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async (editMode: boolean = false) => {
    if (!message.trim() && editMode) {
      setError("Please provide context or instructions for Kronus");
      return;
    }

    setLoading(true);
    setError("");
    setSuggestions(null);

    try {
      const response = await fetch("/api/kronus/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commit_hash: entry.commit_hash,
          repository: entry.repository,
          branch: entry.branch,
          author: entry.author,
          date: entry.date,
          raw_agent_report: message || entry.raw_agent_report,
          existing_entry: editMode ? entry : undefined,
          edit_mode: editMode,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to generate entry");
      }
    } catch (err) {
      setError("Failed to communicate with Kronus");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!suggestions) return;

    setLoading(true);
    try {
      await onUpdate(suggestions);
      setSuggestions(null);
      setMessage("");
    } catch (err) {
      setError("Failed to apply changes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-surface)] p-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <img src="/chronus-logo.png" alt="" className="h-8 w-8 rounded-full" />
          <h2 className="text-2xl font-bold text-[var(--tartarus-gold)]">Chat with Kronus</h2>
        </div>
        <p className="text-[var(--tartarus-ivory-muted)]">
          Ask Kronus to regenerate or refine this journal entry. Provide new context, ask questions,
          or request improvements.
        </p>
      </div>

      <div className="mb-6 space-y-4">
        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-medium text-[var(--tartarus-gold)]">
            New Context or Instructions
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-elevated)] px-4 py-2 text-[var(--tartarus-ivory)] placeholder-[var(--tartarus-ivory-faded)] focus:border-transparent focus:ring-2 focus:ring-[var(--tartarus-gold)]"
            placeholder="Provide new context, ask Kronus to refine specific sections, or describe what you'd like improved..."
          />
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => handleGenerate(false)}
            disabled={loading}
            className="rounded-lg bg-[var(--tartarus-gold)] px-6 py-2 text-[var(--tartarus-void)] font-medium transition-colors hover:bg-[var(--tartarus-gold-bright)] focus:ring-2 focus:ring-[var(--tartarus-gold)] focus:ring-offset-2 focus:ring-offset-[var(--tartarus-surface)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Generating..." : "Regenerate Entry"}
          </button>
          <button
            onClick={() => handleGenerate(true)}
            disabled={loading || !message.trim()}
            className="rounded-lg border border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-gold-soft)] px-6 py-2 text-[var(--tartarus-gold)] font-medium transition-colors hover:bg-[var(--tartarus-gold-dim)] focus:ring-2 focus:ring-[var(--tartarus-gold)] focus:ring-offset-2 focus:ring-offset-[var(--tartarus-surface)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Generating..." : "Edit with Context"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-red-400">
            {error}
          </div>
        )}
      </div>

      {suggestions && (
        <div className="border-t border-[var(--tartarus-border)] pt-6">
          <h3 className="mb-4 text-lg font-semibold text-[var(--tartarus-gold)]">Kronus Suggestions</h3>

          <div className="mb-6 space-y-4">
            <div>
              <h4 className="mb-1 text-sm font-medium text-[var(--tartarus-teal)]">Why</h4>
              <p className="rounded-lg bg-[var(--tartarus-elevated)] p-3 whitespace-pre-wrap text-[var(--tartarus-ivory-muted)]">
                {suggestions.why}
              </p>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-medium text-[var(--tartarus-teal)]">What Changed</h4>
              <p className="rounded-lg bg-[var(--tartarus-elevated)] p-3 whitespace-pre-wrap text-[var(--tartarus-ivory-muted)]">
                {suggestions.what_changed}
              </p>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-medium text-[var(--tartarus-teal)]">Decisions</h4>
              <p className="rounded-lg bg-[var(--tartarus-elevated)] p-3 whitespace-pre-wrap text-[var(--tartarus-ivory-muted)]">
                {suggestions.decisions}
              </p>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-medium text-[var(--tartarus-teal)]">Technologies</h4>
              <p className="rounded-lg bg-[var(--tartarus-elevated)] p-3 whitespace-pre-wrap text-[var(--tartarus-ivory-muted)]">
                {suggestions.technologies}
              </p>
            </div>
            {suggestions.kronus_wisdom && (
              <div>
                <h4 className="mb-1 text-sm font-medium text-[var(--tartarus-gold)]">Kronus Wisdom</h4>
                <p className="rounded-lg border border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-gold-soft)] p-3 whitespace-pre-wrap text-[var(--tartarus-ivory-dim)] italic">
                  {suggestions.kronus_wisdom}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleApply}
              disabled={loading}
              className="rounded-lg bg-[var(--tartarus-teal)] px-6 py-2 text-[var(--tartarus-void)] font-medium transition-colors hover:bg-[var(--tartarus-teal-bright)] focus:ring-2 focus:ring-[var(--tartarus-teal)] focus:ring-offset-2 focus:ring-offset-[var(--tartarus-surface)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply Changes
            </button>
            <button
              onClick={() => setSuggestions(null)}
              className="rounded-lg bg-[var(--tartarus-elevated)] px-6 py-2 text-[var(--tartarus-ivory-muted)] transition-colors hover:bg-[var(--tartarus-border)] focus:ring-2 focus:ring-[var(--tartarus-border)] focus:ring-offset-2 focus:ring-offset-[var(--tartarus-surface)] focus:outline-none"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

