-- Migration 030: Portfolio products catalog + project case-study fields
-- Commercial offerings live in portfolio_products; projects link via product_ids JSON.
-- Run: sqlite3 data/journal.db < web/lib/db/migrations/030_portfolio_products_catalog.sql

CREATE TABLE IF NOT EXISTS portfolio_products (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    tagline TEXT NOT NULL,
    humane_description TEXT NOT NULL,
    buyer_pain TEXT NOT NULL,
    promise TEXT NOT NULL,
    deliverables TEXT DEFAULT '[]',
    starting_price TEXT NOT NULL,
    timeline TEXT NOT NULL,
    cta_label TEXT NOT NULL,
    accent TEXT NOT NULL DEFAULT 'gold' CHECK (accent IN ('gold', 'red', 'blue')),
    wildcard INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    summary TEXT,
    summary_updated_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portfolio_products_display_order ON portfolio_products(display_order);

-- Extend portfolio_projects (idempotent — ignore duplicate column errors when re-run)
-- SQLite has no IF NOT EXISTS for ADD COLUMN; web/lib/db.ts migratePortfolioCatalogSchema handles this.
