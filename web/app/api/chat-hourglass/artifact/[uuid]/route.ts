/**
 * Artifact hydration endpoint.
 *
 * GET /api/chat-hourglass/artifact/[uuid]
 *
 * Takes a UUID from tartarus_objects, resolves the underlying row from its
 * source table, and returns a fully-shaped ArtifactBody the shelf renderer
 * can display. This is the bridge between the compact shelf (refs only)
 * and the viewer (full content).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { lookupByUUID } from "@/lib/object-registry";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  if (!uuid) {
    return NextResponse.json({ error: "uuid required" }, { status: 400 });
  }

  const obj = lookupByUUID(uuid);
  if (!obj) {
    return NextResponse.json({ error: "artifact not found" }, { status: 404 });
  }

  const db = getDatabase();

  try {
    switch (obj.source_table) {
      case "documents": {
        const row = db
          .prepare(`SELECT id, slug, type, title, content, summary, metadata FROM documents WHERE slug = ?`)
          .get(obj.source_id) as
          | { id: number; slug: string; type: string; title: string; content: string; summary: string | null; metadata: string }
          | undefined;
        if (!row) return NextResponse.json({ error: "document not found" }, { status: 404 });
        let tags: string[] = [];
        try {
          const meta = JSON.parse(row.metadata || "{}");
          if (Array.isArray(meta.tags)) tags = meta.tags;
        } catch { /* ignore */ }

        // Detect muse poems / user notes by their tags so the shelf can use
        // the right renderer even though they're stored in `documents`.
        if (row.type === "note" && tags.includes("muse") && tags.includes("poem")) {
          const lines = row.content.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
          return NextResponse.json({
            kind: "muse-poem",
            title: row.title,
            lines,
          });
        }
        if (row.type === "note" && tags.includes("user-note")) {
          return NextResponse.json({
            kind: "user-note",
            title: row.title,
            text: row.content,
            createdAt: Date.now(),
          });
        }
        return NextResponse.json({
          kind: "document",
          documentType: row.type,
          title: row.title,
          content: row.content,
          summary: row.summary ?? undefined,
          tags,
          slug: row.slug,
        });
      }

      case "journal_entries": {
        const row = db
          .prepare(
            `SELECT commit_hash, repository, branch, date, why, what_changed, decisions,
                    technologies, kronus_wisdom, summary
               FROM journal_entries WHERE commit_hash = ?`,
          )
          .get(obj.source_id) as
          | {
              commit_hash: string;
              repository: string;
              branch: string;
              date: string;
              why: string;
              what_changed: string;
              decisions: string;
              technologies: string;
              kronus_wisdom: string | null;
              summary: string | null;
            }
          | undefined;
        if (!row) return NextResponse.json({ error: "entry not found" }, { status: 404 });
        return NextResponse.json({
          kind: "journal-entry",
          commitHash: row.commit_hash,
          repository: row.repository,
          branch: row.branch,
          date: row.date,
          why: row.why,
          whatChanged: row.what_changed,
          decisions: row.decisions,
          technologies: row.technologies,
          kronusWisdom: row.kronus_wisdom ?? undefined,
          summary: row.summary ?? undefined,
        });
      }

      case "media_assets": {
        const row = db
          .prepare(
            `SELECT id, filename, mime_type, description, alt, prompt, model, tags
               FROM media_assets WHERE id = ?`,
          )
          .get(Number(obj.source_id)) as
          | {
              id: number;
              filename: string;
              mime_type: string;
              description: string | null;
              alt: string | null;
              prompt: string | null;
              model: string | null;
              tags: string | null;
            }
          | undefined;
        if (!row) return NextResponse.json({ error: "media not found" }, { status: 404 });
        let tags: string[] = [];
        try { if (row.tags) tags = JSON.parse(row.tags); } catch { /* ignore */ }
        const imageUrl = `/api/media/${row.id}/raw`;
        // Distinguish muse-painted images from generic uploads via the tags.
        if (tags.includes("muse")) {
          // The companion poem (when present) is packed into description as JSON.
          let reason: string | undefined = row.description ?? undefined;
          let companionPoem: { title: string; lines: string[] } | undefined;
          if (row.description) {
            try {
              const parsed = JSON.parse(row.description) as { reason?: string; companionPoem?: { title: string; lines: string[] } };
              if (parsed && typeof parsed === "object" && (parsed.reason !== undefined || parsed.companionPoem)) {
                reason = parsed.reason ?? undefined;
                if (parsed.companionPoem && Array.isArray(parsed.companionPoem.lines)) {
                  companionPoem = parsed.companionPoem;
                }
              }
            } catch { /* description was a plain string — leave as reason */ }
          }
          const renderMode = tags.includes("infographic") ? "infographic" : "mood";
          return NextResponse.json({
            kind: "muse-image",
            imageUrl,
            prompt: row.prompt ?? undefined,
            renderMode,
            reason,
            model: row.model ?? undefined,
            companionPoem,
          });
        }
        return NextResponse.json({
          kind: "media",
          mediaId: row.id,
          imageUrl,
          filename: row.filename,
          alt: row.alt ?? undefined,
          description: row.description ?? undefined,
          prompt: row.prompt ?? undefined,
          model: row.model ?? undefined,
          tags,
        });
      }

      case "project_summaries":
      case "repository_overviews": {
        const row = db
          .prepare(
            `SELECT repository, summary, purpose, architecture, tech_stack, status
               FROM repository_overviews WHERE repository = ?`,
          )
          .get(obj.source_id) as
          | {
              repository: string;
              summary: string | null;
              purpose: string | null;
              architecture: string | null;
              tech_stack: string | null;
              status: string | null;
            }
          | undefined;
        if (!row) return NextResponse.json({ error: "summary not found" }, { status: 404 });
        return NextResponse.json({
          kind: "project-summary",
          repository: row.repository,
          summary: row.summary ?? undefined,
          purpose: row.purpose ?? undefined,
          architecture: row.architecture ?? undefined,
          techStack: row.tech_stack ?? undefined,
          status: row.status ?? undefined,
          raw: row,
        });
      }

      case "entry_attachments": {
        const row = db
          .prepare(
            `SELECT id, filename, mime_type, data FROM entry_attachments WHERE id = ?`,
          )
          .get(Number(obj.source_id)) as
          | { id: number; filename: string; mime_type: string; data: Buffer }
          | undefined;
        if (!row) return NextResponse.json({ error: "attachment not found" }, { status: 404 });
        if (/\.(mmd|mermaid)$/i.test(row.filename)) {
          const code = row.data.toString("utf-8");
          return NextResponse.json({
            kind: "mermaid",
            attachmentId: row.id,
            filename: row.filename,
            code,
          });
        }
        // Unknown attachment type — treat as media (image) if mime starts with image/
        if (row.mime_type?.startsWith("image/")) {
          return NextResponse.json({
            kind: "media",
            mediaId: row.id,
            imageUrl: `/api/attachments/${row.id}/raw`,
            filename: row.filename,
            tags: [],
          });
        }
        return NextResponse.json(
          { error: `unsupported attachment type: ${row.mime_type}` },
          { status: 415 },
        );
      }

      default:
        return NextResponse.json(
          { error: `unsupported source_table: ${obj.source_table}` },
          { status: 415 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
