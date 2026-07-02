import type Database from "better-sqlite3";
import { getDatabase } from "@/lib/db";

export const MEDIA_PERSPECTIVES = [
  "left",
  "right",
  "state",
  "sensationalist",
  "neutral",
  "unknown",
] as const;

export type MediaPerspective = (typeof MEDIA_PERSPECTIVES)[number];

export type MediaDigestStatus = "pending" | "complete" | "failed";

let initialized = false;

/**
 * Idempotent runtime schema bootstrap. Mirrors initArtemisSchema so the digest
 * tables auto-create on first hit in dev/prod without a separate migration runner.
 */
export function initMediaDigestSchema(database: Database.Database = getDatabase()): void {
  if (initialized) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS media_digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digest_date TEXT NOT NULL UNIQUE,
      title TEXT,
      summary TEXT,
      commentary TEXT,
      sections TEXT DEFAULT '[]',
      inbox_summary TEXT,
      item_count INTEGER DEFAULT 0,
      model TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'failed')),
      document_slug TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_media_digests_date ON media_digests(digest_date DESC);

    CREATE TABLE IF NOT EXISTS public_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digest_id INTEGER REFERENCES media_digests(id) ON DELETE CASCADE,
      url TEXT,
      title TEXT NOT NULL,
      snippet TEXT,
      publication TEXT,
      author TEXT,
      topic TEXT,
      topic_label TEXT,
      perspective TEXT DEFAULT 'unknown'
        CHECK (perspective IN ('left', 'right', 'state', 'sensationalist', 'neutral', 'unknown')),
      importance INTEGER DEFAULT 0,
      language TEXT DEFAULT 'en',
      published_at TEXT,
      source_query TEXT,
      provider TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_public_media_digest ON public_media(digest_id);
    CREATE INDEX IF NOT EXISTS idx_public_media_topic ON public_media(topic);
    CREATE INDEX IF NOT EXISTS idx_public_media_importance ON public_media(importance DESC);
  `);

  initialized = true;
}

export interface MediaItemInput {
  url: string | null;
  title: string;
  snippet: string | null;
  publication: string | null;
  author?: string | null;
  topic: string | null;
  topicLabel: string | null;
  publishedAt?: string | null;
  sourceQuery?: string | null;
  provider?: string | null;
  language?: string | null;
  metadata?: Record<string, unknown>;
}

/** Remove any prior digest (and its items via cascade) for a given date. */
export function clearDigestForDate(date: string, database: Database.Database = getDatabase()): void {
  initMediaDigestSchema(database);
  const existing = database
    .prepare("SELECT id FROM media_digests WHERE digest_date = ?")
    .get(date) as { id: number } | undefined;
  if (existing) {
    database.prepare("DELETE FROM public_media WHERE digest_id = ?").run(existing.id);
    database.prepare("DELETE FROM media_digests WHERE id = ?").run(existing.id);
  }
}

export function insertPendingDigest(
  date: string,
  model: string,
  database: Database.Database = getDatabase(),
): number {
  initMediaDigestSchema(database);
  const result = database
    .prepare(
      `INSERT INTO media_digests (digest_date, model, status) VALUES (?, ?, 'pending')`,
    )
    .run(date, model);
  return result.lastInsertRowid as number;
}

export function insertMediaItem(
  digestId: number,
  item: MediaItemInput,
  database: Database.Database = getDatabase(),
): number {
  const result = database
    .prepare(
      `INSERT INTO public_media
        (digest_id, url, title, snippet, publication, author, topic, topic_label,
         published_at, source_query, provider, language, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      digestId,
      item.url,
      item.title,
      item.snippet ?? null,
      item.publication ?? null,
      item.author ?? null,
      item.topic ?? null,
      item.topicLabel ?? null,
      item.publishedAt ?? null,
      item.sourceQuery ?? null,
      item.provider ?? null,
      item.language ?? "en",
      JSON.stringify(item.metadata ?? {}),
    );
  return result.lastInsertRowid as number;
}

export function scoreMediaItem(
  id: number,
  opts: { importance: number; perspective: MediaPerspective; language?: string | null; note?: string | null },
  database: Database.Database = getDatabase(),
): void {
  // Persist the optional editorial note into metadata without clobbering other keys.
  const row = database
    .prepare("SELECT metadata FROM public_media WHERE id = ?")
    .get(id) as { metadata: string | null } | undefined;
  let metadata: Record<string, unknown> = {};
  try {
    metadata = row?.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
  } catch {
    metadata = {};
  }
  if (opts.note) metadata.note = opts.note;

  database
    .prepare(
      `UPDATE public_media
         SET importance = ?, perspective = ?, language = COALESCE(?, language), metadata = ?
       WHERE id = ?`,
    )
    .run(
      Math.max(0, Math.min(100, Math.round(opts.importance))),
      opts.perspective,
      opts.language ?? null,
      JSON.stringify(metadata),
      id,
    );
}

export function finalizeDigest(
  id: number,
  fields: {
    title: string;
    summary: string;
    commentary: string;
    sections: unknown;
    inboxSummary: string | null;
    itemCount: number;
    documentSlug: string | null;
    status: MediaDigestStatus;
  },
  database: Database.Database = getDatabase(),
): void {
  database
    .prepare(
      `UPDATE media_digests
         SET title = ?, summary = ?, commentary = ?, sections = ?, inbox_summary = ?,
             item_count = ?, document_slug = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      fields.title,
      fields.summary,
      fields.commentary,
      JSON.stringify(fields.sections ?? []),
      fields.inboxSummary,
      fields.itemCount,
      fields.documentSlug,
      fields.status,
      id,
    );
}

export function markDigestFailed(
  id: number,
  database: Database.Database = getDatabase(),
): void {
  database
    .prepare(`UPDATE media_digests SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(id);
}

export interface DigestRow {
  id: number;
  digest_date: string;
  title: string | null;
  summary: string | null;
  commentary: string | null;
  sections: string | null;
  inbox_summary: string | null;
  item_count: number;
  model: string | null;
  status: MediaDigestStatus;
  document_slug: string | null;
  created_at: string;
  updated_at: string;
}

export function getLatestDigest(database: Database.Database = getDatabase()): DigestRow | null {
  initMediaDigestSchema(database);
  const row = database
    .prepare("SELECT * FROM media_digests ORDER BY digest_date DESC, id DESC LIMIT 1")
    .get() as DigestRow | undefined;
  return row ?? null;
}

export function getDigestStatus(database: Database.Database = getDatabase()): {
  total: number;
  latest: DigestRow | null;
} {
  initMediaDigestSchema(database);
  const total = (
    database.prepare("SELECT COUNT(*) AS c FROM media_digests").get() as { c: number }
  ).c;
  return { total, latest: getLatestDigest(database) };
}

/**
 * Upsert the mirrored Library document so the digest is immediately readable at
 * /library/{slug}. Keeps daily re-runs idempotent via the slug unique key.
 */
export function upsertDigestDocument(
  opts: { slug: string; title: string; content: string; metadata: Record<string, unknown> },
  database: Database.Database = getDatabase(),
): void {
  database
    .prepare(
      `INSERT INTO documents (slug, type, title, content, language, metadata)
       VALUES (?, 'note', ?, ?, 'en', ?)
       ON CONFLICT(slug) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         metadata = excluded.metadata,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(opts.slug, opts.title, opts.content, JSON.stringify(opts.metadata));
}
