/**
 * POST /api/chat-hourglass/shelf/add
 *
 * Unified endpoint for adding an artifact to the shelf. Three request
 * shapes — the server always responds with a uniform ArtifactRefPayload.
 *
 *   { kind: "note", title, text }            → insert document(type=note, tags=["user-note"])
 *   { kind: "repo-ref", sourceTable, sourceId } → lookup existing UUID (no new rows)
 *   (upload is served by the existing /api/media/upload endpoint — caller
 *    hits that separately and then calls { kind: "repo-ref" } with the id)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { lookupBySource, registerObject } from "@/lib/object-registry";

export const runtime = "nodejs";

type ShelfKind =
  | "muse-image"
  | "muse-poem"
  | "document"
  | "journal-entry"
  | "media"
  | "project-summary"
  | "user-note"
  | "mermaid";

interface ArtifactRefPayload {
  uuid: string;
  kind: ShelfKind;
  addedAt: number;
  source: "user-add";
  title: string;
  summary?: string;
  thumbUrl?: string;
  sourceTable: string;
  sourceId: string;
}

interface NoteBody {
  kind: "note";
  title: string;
  text: string;
}

interface RepoRefBody {
  kind: "repo-ref";
  sourceTable: string;
  sourceId: string;
}

type Body = NoteBody | RepoRefBody;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `note-${Date.now()}`;
}

/**
 * Map a source_table → the ArtifactKind we display in the shelf. Kept
 * aligned with `ArtifactKind` in
 * web/components/chat/hourglass/artifacts/types.ts.
 */
function kindForSource(sourceTable: string, sourceId: string, db: ReturnType<typeof getDatabase>): ShelfKind {
  if (sourceTable === "documents") {
    // Distinguish muse-poem / user-note via tags.
    const row = db
      .prepare(`SELECT type, metadata FROM documents WHERE slug = ?`)
      .get(sourceId) as { type: string; metadata: string | null } | undefined;
    if (!row) return "document";
    let tags: string[] = [];
    try {
      const meta = JSON.parse(row.metadata || "{}");
      if (Array.isArray(meta.tags)) tags = meta.tags;
    } catch { /* ignore */ }
    if (row.type === "note" && tags.includes("muse") && tags.includes("poem")) return "muse-poem";
    if (row.type === "note" && tags.includes("user-note")) return "user-note";
    return "document";
  }
  if (sourceTable === "journal_entries") return "journal-entry";
  if (sourceTable === "media_assets") {
    // muse-painted vs generic media via tags
    const row = db
      .prepare(`SELECT tags FROM media_assets WHERE id = ?`)
      .get(Number(sourceId)) as { tags: string | null } | undefined;
    let tags: string[] = [];
    try { if (row?.tags) tags = JSON.parse(row.tags); } catch { /* ignore */ }
    if (tags.includes("muse")) return "muse-image";
    return "media";
  }
  if (sourceTable === "project_summaries" || sourceTable === "repository_overviews")
    return "project-summary";
  if (sourceTable === "entry_attachments") return "mermaid";
  return "document";
}

function buildRef(
  uuid: string,
  kind: ShelfKind,
  sourceTable: string,
  sourceId: string,
  title: string,
  summary: string | undefined,
  thumbUrl: string | undefined,
): ArtifactRefPayload {
  return {
    uuid,
    kind,
    addedAt: Date.now(),
    source: "user-add",
    title,
    summary,
    thumbUrl,
    sourceTable,
    sourceId,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const db = getDatabase();

  try {
    if (body.kind === "note") {
      const title = (body.title || "untitled").trim();
      const text = String(body.text || "").trim();
      if (!text) return NextResponse.json({ error: "empty note" }, { status: 400 });

      // Ensure a unique slug.
      let slug = slugify(title);
      const existing = db.prepare(`SELECT id FROM documents WHERE slug = ?`).get(slug);
      if (existing) slug = `${slug}-${Date.now().toString(36)}`;

      const metadata = JSON.stringify({ tags: ["user-note"] });
      db.prepare(
        `INSERT INTO documents (slug, type, title, content, language, metadata, summary)
         VALUES (?, 'note', ?, ?, 'en', ?, ?)`,
      ).run(slug, title, text, metadata, text.slice(0, 200));

      const uuid = registerObject({
        type: "note",
        sourceTable: "documents",
        sourceId: slug,
        title,
        summary: text.slice(0, 200),
        tags: ["user-note"],
      });

      return NextResponse.json(
        buildRef(uuid, "user-note", "documents", slug, title, text.slice(0, 200), undefined),
      );
    }

    if (body.kind === "repo-ref") {
      const { sourceTable, sourceId } = body;
      if (!sourceTable || !sourceId) {
        return NextResponse.json({ error: "sourceTable + sourceId required" }, { status: 400 });
      }

      let obj = lookupBySource(sourceTable, String(sourceId));

      // Auto-register on demand — catches rows that predate the registry hooks.
      if (!obj) {
        let title = String(sourceId);
        let summary: string | undefined;
        if (sourceTable === "documents") {
          const row = db.prepare(`SELECT title, summary FROM documents WHERE slug = ?`).get(sourceId) as
            | { title: string; summary: string | null }
            | undefined;
          if (!row) return NextResponse.json({ error: "document not found" }, { status: 404 });
          title = row.title;
          summary = row.summary ?? undefined;
        } else if (sourceTable === "journal_entries") {
          const row = db.prepare(`SELECT why, summary FROM journal_entries WHERE commit_hash = ?`).get(sourceId) as
            | { why: string; summary: string | null }
            | undefined;
          if (!row) return NextResponse.json({ error: "entry not found" }, { status: 404 });
          title = row.why.slice(0, 80);
          summary = row.summary ?? undefined;
        } else if (sourceTable === "media_assets") {
          const row = db.prepare(`SELECT filename, description FROM media_assets WHERE id = ?`).get(Number(sourceId)) as
            | { filename: string; description: string | null }
            | undefined;
          if (!row) return NextResponse.json({ error: "media not found" }, { status: 404 });
          title = row.filename;
          summary = row.description ?? undefined;
        } else if (sourceTable === "project_summaries" || sourceTable === "repository_overviews") {
          const row = db
            .prepare(`SELECT summary FROM repository_overviews WHERE repository = ?`)
            .get(sourceId) as
            | { summary: string | null }
            | undefined;
          if (!row) return NextResponse.json({ error: "summary not found" }, { status: 404 });
          title = String(sourceId);
          summary = row.summary ?? undefined;
        }
        const regType =
          sourceTable === "documents"
            ? "document"
            : sourceTable === "repository_overviews" || sourceTable === "project_summaries"
              ? "project_summary"
              : sourceTable.replace(/s$/, "");
        registerObject({
          type: regType,
          sourceTable,
          sourceId: String(sourceId),
          title,
          summary,
        });
        obj = lookupBySource(sourceTable, String(sourceId));
        if (!obj) return NextResponse.json({ error: "failed to register" }, { status: 500 });
      }

      const kind = kindForSource(sourceTable, String(sourceId), db);
      const thumbUrl =
        sourceTable === "media_assets" ? `/api/media/${sourceId}/raw` : undefined;
      return NextResponse.json(
        buildRef(obj.uuid, kind, sourceTable, String(sourceId), obj.title ?? String(sourceId), obj.summary ?? undefined, thumbUrl),
      );
    }

    return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
