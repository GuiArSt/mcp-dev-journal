"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { FileText, Upload, Search, Loader2 } from "lucide-react";
import type { ArtifactRef } from "./types";

type Tab = "note" | "repo" | "upload";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (ref: ArtifactRef) => void;
}

interface RepoResult {
  sourceTable: "documents" | "journal_entries" | "media_assets" | "project_summaries" | "repository_overviews";
  sourceId: string;
  title: string;
  summary?: string;
  subtitle?: string;
  thumbUrl?: string;
}

export function ArtifactAddSheet({ open, onOpenChange, onAdded }: Props) {
  const [tab, setTab] = useState<Tab>("note");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[480px] max-w-[90vw] bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
      >
        <SheetHeader>
          <SheetTitle className="text-[var(--tartarus-ivory)] font-['var(--hg-font-oracle)'] italic text-xl">
            Add to the shelf
          </SheetTitle>
          <SheetDescription className="text-[var(--tartarus-ivory-muted)]">
            Drop a note, pull from the repository, or upload a file. Whatever you add, Kronus will see.
          </SheetDescription>
        </SheetHeader>

        <div className="hg-add-tabs">
          <button
            className={`hg-add-tab${tab === "note" ? " active" : ""}`}
            onClick={() => setTab("note")}
            type="button"
          >
            note
          </button>
          <button
            className={`hg-add-tab${tab === "repo" ? " active" : ""}`}
            onClick={() => setTab("repo")}
            type="button"
          >
            from repository
          </button>
          <button
            className={`hg-add-tab${tab === "upload" ? " active" : ""}`}
            onClick={() => setTab("upload")}
            type="button"
          >
            upload
          </button>
        </div>

        <div className="hg-add-body">
          {tab === "note" && <NoteTab onAdded={(r) => { onAdded(r); onOpenChange(false); }} />}
          {tab === "repo" && <RepoTab onAdded={(r) => { onAdded(r); onOpenChange(false); }} />}
          {tab === "upload" && <UploadTab onAdded={(r) => { onAdded(r); onOpenChange(false); }} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Note tab ─────────────────────────────────────────────────────────

function NoteTab({ onAdded }: { onAdded: (ref: ArtifactRef) => void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat-hourglass/shelf/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "note", title: title.trim() || "untitled", text }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`add ${res.status}: ${detail}`);
      }
      const ref = (await res.json()) as ArtifactRef;
      onAdded(ref);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }, [title, text, onAdded]);

  return (
    <div className="hg-add-form">
      <label className="hg-add-label">
        <span>title</span>
        <input
          className="hg-add-input"
          placeholder="untitled"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="hg-add-label">
        <span>body</span>
        <textarea
          className="hg-add-textarea"
          placeholder="drop a note for Kronus…"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error && <div className="hg-add-error">{error}</div>}
      <button className="hg-add-submit" onClick={submit} disabled={busy || !text.trim()} type="button">
        {busy ? <Loader2 className="animate-spin" size={14} /> : null}
        show to Kronus
      </button>
    </div>
  );
}

// ─── Repo tab ─────────────────────────────────────────────────────────

/**
 * Read a fetch response as JSON, but if the body isn't JSON (e.g. auth
 * middleware redirected to /login HTML), throw a clear error instead of
 * letting JSON.parse blow up with a cryptic message.
 */
async function safeJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`${label} ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) {
    // Most likely cookie expired and middleware redirected to /login.
    throw new Error(`${label}: not JSON (auth?). Try reloading.`);
  }
  return res.json() as Promise<T>;
}

async function fetchRepoResults(q: string): Promise<RepoResult[]> {
  const qLower = q.toLowerCase();
  const [docsRes, entriesRes, mediaRes, summariesRes] = await Promise.all([
    fetch(q ? `/api/documents?search=${encodeURIComponent(q)}&limit=12` : `/api/documents?limit=12`),
    fetch(`/api/entries?limit=20`),
    fetch(`/api/media?limit=20`),
    fetch(`/api/repository-overviews`),
  ]);

  const docsJson = await safeJson<{ documents?: Array<{ slug: string; title: string; type: string; summary?: string }> }>(docsRes, "documents");
  const entriesJson = await safeJson<{ entries?: Array<{ commit_hash: string; why: string; repository: string; summary?: string | null }> }>(entriesRes, "entries");
  // Media + summaries are nice-to-have — degrade silently if they fail
  let mediaJson: { assets?: Array<{ id: number; filename: string; description?: string | null; tags?: string | null }> } = {};
  try { mediaJson = await safeJson(mediaRes, "media"); } catch { mediaJson = {}; }
  let summariesJson: { summaries?: Array<{ repository: string; summary?: string | null }> } = {};
  try { summariesJson = await safeJson(summariesRes, "summaries"); } catch { summariesJson = {}; }

  const docResults: RepoResult[] = (docsJson.documents ?? []).map((d) => ({
    sourceTable: "documents" as const,
    sourceId: d.slug,
    title: d.title,
    summary: d.summary,
    subtitle: `document · ${d.type}`,
  }));
  const entryResults: RepoResult[] = (entriesJson.entries ?? [])
    .filter((e) =>
      !q ||
      (e.why || "").toLowerCase().includes(qLower) ||
      (e.summary || "").toLowerCase().includes(qLower) ||
      (e.repository || "").toLowerCase().includes(qLower),
    )
    .slice(0, 10)
    .map((e) => ({
      sourceTable: "journal_entries" as const,
      sourceId: e.commit_hash,
      title: e.why.slice(0, 80),
      summary: e.summary || undefined,
      subtitle: `journal · ${e.repository}`,
    }));
  const mediaResults: RepoResult[] = (mediaJson.assets ?? [])
    .filter((m) => !q ||
      (m.filename || "").toLowerCase().includes(qLower) ||
      (m.description || "").toLowerCase().includes(qLower),
    )
    .slice(0, 8)
    .map((m) => ({
      sourceTable: "media_assets" as const,
      sourceId: String(m.id),
      title: m.filename,
      summary: m.description || undefined,
      subtitle: "media",
      thumbUrl: `/api/media/${m.id}/raw`,
    }));
  const summaryResults: RepoResult[] = (summariesJson.summaries ?? [])
    .filter((s) => !q || (s.repository || "").toLowerCase().includes(qLower))
    .slice(0, 6)
    .map((s) => ({
      sourceTable: "repository_overviews" as const,
      sourceId: s.repository,
      title: s.repository,
      summary: s.summary || undefined,
      subtitle: "Repository overview (Entry 0)",
    }));
  return [...docResults, ...entryResults, ...mediaResults, ...summaryResults];
}

function RepoTab({ onAdded }: { onAdded: (ref: ArtifactRef) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RepoResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load defaults on mount
  useEffect(() => {
    setBusy(true);
    setError(null);
    fetchRepoResults("")
      .then(setResults)
      .catch((err) => setError(err instanceof Error ? err.message : "load failed"))
      .finally(() => setBusy(false));
  }, []);

  // Debounced search when user types
  useEffect(() => {
    const q = query.trim();
    if (!q) return; // mount effect handles the empty case
    const handle = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        setResults(await fetchRepoResults(q));
      } catch (err) {
        setError(err instanceof Error ? err.message : "search failed");
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const pick = useCallback(async (r: RepoResult) => {
    setAddingId(`${r.sourceTable}:${r.sourceId}`);
    setError(null);
    try {
      const res = await fetch("/api/chat-hourglass/shelf/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "repo-ref", sourceTable: r.sourceTable, sourceId: r.sourceId }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`add ${res.status}: ${detail}`);
      }
      const ref = (await res.json()) as ArtifactRef;
      onAdded(ref);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setAddingId(null);
    }
  }, [onAdded]);

  return (
    <div className="hg-add-form">
      <label className="hg-add-label">
        <span>search</span>
        <div className="hg-add-search-wrap">
          <Search size={14} />
          <input
            className="hg-add-input"
            placeholder="search documents, journal entries…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </label>
      {busy && <div className="hg-add-hint"><Loader2 className="animate-spin" size={14} /> searching</div>}
      {error && <div className="hg-add-error">{error}</div>}
      <div className="hg-add-results">
        {results.map((r) => {
          const id = `${r.sourceTable}:${r.sourceId}`;
          return (
            <button
              key={id}
              className="hg-add-result"
              onClick={() => pick(r)}
              disabled={addingId === id}
              type="button"
            >
              <div className="hg-add-result-icon">
                {r.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumbUrl} alt="" />
                ) : r.sourceTable === "journal_entries" ? "◷"
                  : r.sourceTable === "media_assets" ? "▣"
                  : r.sourceTable === "project_summaries" || r.sourceTable === "repository_overviews"
                    ? "◆"
                  : "¶"}
              </div>
              <div className="hg-add-result-body">
                <div className="hg-add-result-title">{r.title}</div>
                {r.summary && <div className="hg-add-result-summary">{r.summary.slice(0, 140)}</div>}
                <div className="hg-add-result-meta">{r.subtitle}</div>
              </div>
              {addingId === id && <Loader2 className="animate-spin" size={14} />}
            </button>
          );
        })}
        {!busy && results.length === 0 && (
          <div className="hg-add-hint">no items found</div>
        )}
      </div>
    </div>
  );
}

// ─── Upload tab ──────────────────────────────────────────────────────

function UploadTab({ onAdded }: { onAdded: (ref: ArtifactRef) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("destination", "media");
      form.append("tags", JSON.stringify(["user-upload"]));
      const uploadRes = await fetch("/api/media/upload", { method: "POST", body: form });
      if (!uploadRes.ok) {
        const detail = await uploadRes.text().catch(() => "");
        throw new Error(`upload ${uploadRes.status}: ${detail.slice(0, 160)}`);
      }
      const ct = uploadRes.headers.get("content-type") || "";
      if (!ct.includes("json")) {
        throw new Error("upload: not JSON (auth?). Try reloading.");
      }
      const uploaded = (await uploadRes.json()) as { id?: number };
      if (!uploaded.id) throw new Error("upload: no id returned");
      // Now add the fresh media to the shelf via repo-ref (registry already seeded by upload hook).
      const addRes = await fetch("/api/chat-hourglass/shelf/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "repo-ref", sourceTable: "media_assets", sourceId: String(uploaded.id) }),
      });
      if (!addRes.ok) {
        const detail = await addRes.text().catch(() => "");
        throw new Error(`add ${addRes.status}: ${detail}`);
      }
      const ref = (await addRes.json()) as ArtifactRef;
      onAdded(ref);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }, [onAdded]);

  return (
    <div className="hg-add-form">
      <label className="hg-add-drop" htmlFor="hg-upload-input">
        {busy ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
        <span>{busy ? "uploading…" : "click to pick a file"}</span>
        <span className="hg-add-hint">images, documents, mermaid (.mmd)</span>
      </label>
      <input
        id="hg-upload-input"
        type="file"
        style={{ display: "none" }}
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {error && <div className="hg-add-error">{error}</div>}
    </div>
  );
}
