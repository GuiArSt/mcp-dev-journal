/**
 * POST /api/registry/link
 *
 * Retroactively attach an existing artifact (by UUID) to a journal entry,
 * document, or portfolio project. For media_assets this updates the
 * direct linkage columns (commit_hash / document_id / portfolio_project_id)
 * and re-derives `destination` accordingly.
 *
 * For non-media artifacts (documents, journal entries, etc.), cross-type
 * linking would require a generic `tartarus_object_links` join table —
 * deferred. This route returns 501 for those cases until then.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { lookupByUUID } from "@/lib/object-registry";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";

const LinkBodySchema = z.object({
  uuid: z.string().min(1, "uuid is required"),
  target: z.object({
    kind: z.enum(["journal", "document", "portfolio"]),
    id: z.string().min(1, "target.id is required"),
  }),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { uuid, target } = await requireBody(LinkBodySchema, request);
  const db = getDatabase();

  const obj = lookupByUUID(uuid);
  if (!obj) {
    return NextResponse.json({ error: `no object with uuid ${uuid}` }, { status: 404 });
  }

  // Currently we only support linking media_assets — the only table with
  // dedicated linkage columns. Everything else needs the tartarus_object_links
  // join table (not yet built).
  if (obj.source_table !== "media_assets") {
    return NextResponse.json(
      {
        error: `linking artifacts of type '${obj.source_table}' is not yet supported`,
        hint: "Only media_assets can be linked retroactively right now. A generic object-links join table is deferred.",
      },
      { status: 501 },
    );
  }

  const mediaId = Number(obj.source_id);
  if (!Number.isFinite(mediaId)) {
    return NextResponse.json({ error: `invalid media_assets id: ${obj.source_id}` }, { status: 400 });
  }

  if (target.kind === "journal") {
    // Verify the journal entry exists.
    const entry = db.prepare(`SELECT commit_hash, why FROM journal_entries WHERE commit_hash = ?`).get(target.id) as
      | { commit_hash: string; why: string }
      | undefined;
    if (!entry) {
      return NextResponse.json({ error: `journal entry not found: ${target.id}` }, { status: 404 });
    }
    db.prepare(
      `UPDATE media_assets
         SET commit_hash = ?, document_id = NULL, portfolio_project_id = NULL, destination = 'journal'
         WHERE id = ?`,
    ).run(target.id, mediaId);
    return NextResponse.json({
      ok: true,
      linked: { kind: "journal", sourceTable: "journal_entries", sourceId: target.id, title: entry.why?.slice(0, 80) },
    });
  }

  if (target.kind === "document") {
    // Accept either numeric id or slug for documents.
    const numId = Number(target.id);
    const docRow = Number.isFinite(numId)
      ? (db.prepare(`SELECT id, slug, title FROM documents WHERE id = ?`).get(numId) as
          | { id: number; slug: string; title: string }
          | undefined)
      : (db.prepare(`SELECT id, slug, title FROM documents WHERE slug = ?`).get(target.id) as
          | { id: number; slug: string; title: string }
          | undefined);
    if (!docRow) {
      return NextResponse.json({ error: `document not found: ${target.id}` }, { status: 404 });
    }
    db.prepare(
      `UPDATE media_assets
         SET document_id = ?, commit_hash = NULL, portfolio_project_id = NULL, destination = 'repository'
         WHERE id = ?`,
    ).run(docRow.id, mediaId);
    return NextResponse.json({
      ok: true,
      linked: { kind: "document", sourceTable: "documents", sourceId: docRow.slug, title: docRow.title },
    });
  }

  // portfolio
  const proj = db.prepare(`SELECT id, title FROM portfolio_projects WHERE id = ?`).get(target.id) as
    | { id: string; title: string }
    | undefined;
  if (!proj) {
    return NextResponse.json({ error: `portfolio project not found: ${target.id}` }, { status: 404 });
  }
  db.prepare(
    `UPDATE media_assets
       SET portfolio_project_id = ?, commit_hash = NULL, document_id = NULL, destination = 'portfolio'
       WHERE id = ?`,
  ).run(target.id, mediaId);
  return NextResponse.json({
    ok: true,
    linked: { kind: "portfolio", sourceTable: "portfolio_projects", sourceId: target.id, title: proj.title },
  });
});
