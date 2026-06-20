/**
 * Muse image persistence — media_assets + tartarus_objects registry.
 * Shared by /api/chat-hourglass/muse and /api/chat-hourglass/muse/edit.
 */

import { getDatabase } from "@/lib/db";
import { registerObject } from "@/lib/object-registry";
import type { MuseProvider } from "@/lib/ai/muse-provider";

export interface ArtifactRefPayload {
  uuid: string;
  kind: "muse-image" | "muse-poem";
  addedAt: number;
  source: "muse-auto" | "muse-forced" | "muse-edited";
  title: string;
  summary?: string;
  thumbUrl?: string;
  sourceTable: string;
  sourceId: string;
  renderMode?: "mood" | "infographic";
  reason?: string;
  companionPoem?: { title: string; lines: string[] };
  styleHint?: string;
  linked?: {
    kind: "journal" | "document" | "portfolio";
    sourceTable: "journal_entries" | "documents" | "portfolio_projects";
    sourceId: string;
    title?: string;
  };
}

export function persistMuseImage(opts: {
  dataUrl: string;
  prompt: string;
  renderMode: "mood" | "infographic";
  painterModel: string;
  provider: MuseProvider;
  reason: string | null;
  source: "muse-auto" | "muse-forced" | "muse-edited";
  companionPoem?: { title: string; lines: string[] } | null;
  styleHint?: string | null;
  turnIndex?: number;
  commitHash?: string;
  documentId?: number;
  portfolioProjectId?: string;
  /** Optional shelf / registry UUID of the image this edit was derived from. */
  editOfArtifactUuid?: string | null;
}): ArtifactRefPayload {
  const db = getDatabase();
  try {
    db.exec(`ALTER TABLE media_assets ADD COLUMN label TEXT`);
  } catch {
    /* column exists */
  }

  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(opts.dataUrl);
  if (!match) throw new Error("persistMuseImage: expected a data:image/...;base64,... URL");
  const mimeType = match[1];
  const base64 = match[2];
  const fileSize = Math.ceil(base64.length * 0.75);
  const timestamp = Date.now();
  const fileStem = opts.source === "muse-edited" ? "muse-edit" : "muse";
  const filename = `${fileStem}-${opts.renderMode}-${timestamp}.png`;
  const tagList = ["muse", opts.renderMode, opts.provider];
  if (opts.source === "muse-edited") tagList.push("edit");
  if (opts.styleHint) tagList.push(opts.styleHint);
  const tags = JSON.stringify(tagList);

  const promptHash = (() => {
    let h = 0x811c9dc5;
    for (let i = 0; i < opts.prompt.length; i++) {
      h ^= opts.prompt.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8);
  })();
  const turnPart = opts.turnIndex != null ? `turn-${opts.turnIndex}` : `t-${timestamp.toString(36).slice(-6)}`;
  const label =
    opts.source === "muse-edited"
      ? `muse:edit:${opts.renderMode}:${turnPart}:${promptHash}`
      : `muse:${opts.renderMode}:${turnPart}:${promptHash}`;

  const descriptionPayload = opts.companionPoem
    ? JSON.stringify({
        reason: opts.reason,
        companionPoem: opts.companionPoem,
        styleHint: opts.styleHint ?? null,
        editOfArtifactUuid: opts.editOfArtifactUuid ?? undefined,
      })
    : opts.styleHint
      ? JSON.stringify({
          reason: opts.reason,
          styleHint: opts.styleHint,
          editOfArtifactUuid: opts.editOfArtifactUuid ?? undefined,
        })
    : opts.editOfArtifactUuid
      ? JSON.stringify({
          reason: opts.reason,
          editOfArtifactUuid: opts.editOfArtifactUuid,
        })
      : opts.reason ?? null;

  const destination =
    opts.commitHash ? "journal"
    : opts.documentId ? "repository"
    : opts.portfolioProjectId ? "portfolio"
    : "media";

  const result = db
    .prepare(
      `INSERT INTO media_assets
         (filename, mime_type, data, file_size, description, prompt, model, tags, label,
          destination, commit_hash, document_id, portfolio_project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      filename,
      mimeType,
      base64,
      fileSize,
      descriptionPayload,
      opts.prompt,
      opts.painterModel,
      tags,
      label,
      destination,
      opts.commitHash ?? null,
      opts.documentId ?? null,
      opts.portfolioProjectId ?? null,
    );

  const id = String(result.lastInsertRowid);
  const uuid = registerObject({
    type: "media_asset",
    sourceTable: "media_assets",
    sourceId: id,
    title: filename,
    summary: opts.prompt,
    tags: tagList,
  });

  let linked: ArtifactRefPayload["linked"] | undefined;
  if (opts.commitHash) {
    let title: string | undefined;
    try {
      const row = db.prepare(`SELECT why FROM journal_entries WHERE commit_hash = ?`).get(opts.commitHash) as
        | { why?: string }
        | undefined;
      title = row?.why ? row.why.slice(0, 80) : undefined;
    } catch {
      /* ignore */
    }
    linked = { kind: "journal", sourceTable: "journal_entries", sourceId: opts.commitHash, title };
  } else if (opts.documentId) {
    let title: string | undefined;
    let slug: string | undefined;
    try {
      const row = db.prepare(`SELECT slug, title FROM documents WHERE id = ?`).get(opts.documentId) as
        | { slug?: string; title?: string }
        | undefined;
      title = row?.title;
      slug = row?.slug;
    } catch {
      /* ignore */
    }
    linked = { kind: "document", sourceTable: "documents", sourceId: slug ?? String(opts.documentId), title };
  } else if (opts.portfolioProjectId) {
    let title: string | undefined;
    try {
      const row = db.prepare(`SELECT title FROM portfolio_projects WHERE id = ?`).get(opts.portfolioProjectId) as
        | { title?: string }
        | undefined;
      title = row?.title;
    } catch {
      /* ignore */
    }
    linked = {
      kind: "portfolio",
      sourceTable: "portfolio_projects",
      sourceId: opts.portfolioProjectId,
      title,
    };
  }

  const thumbUrl = `/api/media/${id}/raw`;

  if (opts.portfolioProjectId) {
    try {
      db.prepare(`UPDATE portfolio_projects SET image = ?, updated_at = ? WHERE id = ?`).run(
        thumbUrl,
        new Date().toISOString(),
        opts.portfolioProjectId,
      );
    } catch {
      /* non-critical — media linkage still valid */
    }
  }

  return {
    uuid,
    kind: "muse-image",
    addedAt: timestamp,
    source: opts.source,
    title: opts.prompt.length > 80 ? `${opts.prompt.slice(0, 80)}…` : opts.prompt,
    summary: opts.reason ?? undefined,
    thumbUrl,
    sourceTable: "media_assets",
    sourceId: id,
    renderMode: opts.renderMode,
    reason: opts.reason ?? undefined,
    companionPoem: opts.companionPoem ?? undefined,
    styleHint: opts.styleHint ?? undefined,
    linked,
  };
}
