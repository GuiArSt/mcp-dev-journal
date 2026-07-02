-- Migration 032: Daily media digest
-- media_digests = one composed daily newsletter; public_media = individual
-- ingested articles/items that belong to a digest. Built to scale beyond v1.
-- Run: sqlite3 data/journal.db < web/lib/db/migrations/032_media_digest.sql
-- (Runtime auto-apply: web/lib/media-digest/db.ts initMediaDigestSchema().)

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
