/**
 * Prompt store — DB-backed prompt versioning for the AI control panel.
 *
 * Provides:
 *   getPrompt(slug, fallback)   — load active version; seed from fallback on first call
 *   upsertPrompt(slug, content) — save new version, activate it
 *   getPromptHistory(slug)      — list all versions for a slug
 *   getMuseConfig()             — load muse_config row (seeded with defaults on first call)
 *   setMuseConfig(patch)        — partial update muse_config
 *   listPromptSlugs()           — list all known slugs with active version info
 */

import { getDatabase } from "@/lib/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PromptVersion {
  id: number;
  promptSlug: string;
  version: number;
  content: string;
  config: Record<string, unknown>;
  label: string;
  createdAt: string;
  createdBy: string;
}

export interface PromptSlugInfo {
  slug: string;
  activeVersion: number;
  label: string;
  updatedAt: string;
}

export interface MuseConfig {
  provider: "openai" | "google";
  driverModel: string;
  painterModel: string;
  observeModel: string;
  tickEvery: number;
  moodSize: string;
  infographicSize: string;
  moodQuality: string;
  infographicQuality: string;
  updatedAt: string;
}

// ─── Migration (runs once on first use) ──────────────────────────────────────

let migrated = false;

function ensureTables() {
  if (migrated) return;
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_prompt_versions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_slug TEXT    NOT NULL,
      version     INTEGER NOT NULL,
      content     TEXT    NOT NULL,
      config      TEXT    NOT NULL DEFAULT '{}',
      label       TEXT    NOT NULL DEFAULT 'draft',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      created_by  TEXT    NOT NULL DEFAULT 'system',
      UNIQUE(prompt_slug, version)
    );

    CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_slug ON ai_prompt_versions(prompt_slug);

    CREATE TABLE IF NOT EXISTS ai_prompt_active (
      prompt_slug TEXT PRIMARY KEY,
      version     INTEGER NOT NULL,
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS muse_config (
      id                  INTEGER PRIMARY KEY CHECK (id = 1),
      provider            TEXT    NOT NULL DEFAULT 'openai',
      driver_model        TEXT    NOT NULL DEFAULT 'gpt-5.4',
      painter_model       TEXT    NOT NULL DEFAULT 'gpt-image-2',
      observe_model       TEXT    NOT NULL DEFAULT 'gemini-2.5-flash',
      tick_every          INTEGER NOT NULL DEFAULT 3,
      mood_size           TEXT    NOT NULL DEFAULT '1K',
      infographic_size    TEXT    NOT NULL DEFAULT '2K',
      mood_quality        TEXT    NOT NULL DEFAULT 'low',
      infographic_quality TEXT    NOT NULL DEFAULT 'high',
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO muse_config (id) VALUES (1);
  `);
  migrated = true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nextVersion(slug: string): number {
  const db = getDatabase();
  const row = db
    .prepare("SELECT MAX(version) as max_v FROM ai_prompt_versions WHERE prompt_slug = ?")
    .get(slug) as { max_v: number | null };
  return (row?.max_v ?? 0) + 1;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the content of the active version for `slug`.
 * If no version exists yet, seeds from `defaultContent` as v1 (label "production").
 */
export function getPrompt(slug: string, defaultContent: string): string {
  ensureTables();
  const db = getDatabase();

  const active = db
    .prepare("SELECT version FROM ai_prompt_active WHERE prompt_slug = ?")
    .get(slug) as { version: number } | undefined;

  if (!active) {
    // Seed: write v1, mark production, activate it.
    db.prepare(
      "INSERT OR IGNORE INTO ai_prompt_versions (prompt_slug, version, content, label, created_by) VALUES (?, 1, ?, 'production', 'system')"
    ).run(slug, defaultContent);
    db.prepare(
      "INSERT OR REPLACE INTO ai_prompt_active (prompt_slug, version, updated_at) VALUES (?, 1, datetime('now'))"
    ).run(slug);
    return defaultContent;
  }

  const row = db
    .prepare("SELECT content FROM ai_prompt_versions WHERE prompt_slug = ? AND version = ?")
    .get(slug, active.version) as { content: string } | undefined;

  return row?.content ?? defaultContent;
}

/**
 * Save `content` as a new version of `slug` and immediately activate it.
 * Returns the new version number.
 */
export function upsertPrompt(
  slug: string,
  content: string,
  options: { label?: string; config?: Record<string, unknown>; createdBy?: string } = {}
): number {
  ensureTables();
  const db = getDatabase();
  const version = nextVersion(slug);
  const label = options.label ?? "draft";
  const config = JSON.stringify(options.config ?? {});
  const createdBy = options.createdBy ?? "user";

  db.prepare(
    "INSERT INTO ai_prompt_versions (prompt_slug, version, content, config, label, created_by) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(slug, version, content, config, label, createdBy);

  db.prepare(
    "INSERT OR REPLACE INTO ai_prompt_active (prompt_slug, version, updated_at) VALUES (?, ?, datetime('now'))"
  ).run(slug, version);

  return version;
}

/**
 * Set an existing version as the active one (for rollback / promotion).
 */
export function activateVersion(slug: string, version: number): void {
  ensureTables();
  const db = getDatabase();
  const exists = db
    .prepare("SELECT 1 FROM ai_prompt_versions WHERE prompt_slug = ? AND version = ?")
    .get(slug, version);
  if (!exists) throw new Error(`Version ${version} of '${slug}' not found`);
  db.prepare(
    "INSERT OR REPLACE INTO ai_prompt_active (prompt_slug, version, updated_at) VALUES (?, ?, datetime('now'))"
  ).run(slug, version);
}

/**
 * All versions for a slug, newest first.
 */
export function getPromptHistory(slug: string): PromptVersion[] {
  ensureTables();
  const db = getDatabase();
  const rows = db
    .prepare(
      "SELECT id, prompt_slug, version, content, config, label, created_at, created_by FROM ai_prompt_versions WHERE prompt_slug = ? ORDER BY version DESC"
    )
    .all(slug) as Array<{
      id: number;
      prompt_slug: string;
      version: number;
      content: string;
      config: string;
      label: string;
      created_at: string;
      created_by: string;
    }>;
  return rows.map((r) => ({
    id: r.id,
    promptSlug: r.prompt_slug,
    version: r.version,
    content: r.content,
    config: JSON.parse(r.config || "{}"),
    label: r.label,
    createdAt: r.created_at,
    createdBy: r.created_by,
  }));
}

/**
 * Get the active version record for a slug (or null if not seeded).
 */
export function getActiveVersion(slug: string): PromptVersion | null {
  ensureTables();
  const db = getDatabase();
  const active = db
    .prepare("SELECT version FROM ai_prompt_active WHERE prompt_slug = ?")
    .get(slug) as { version: number } | undefined;
  if (!active) return null;
  const row = db
    .prepare(
      "SELECT id, prompt_slug, version, content, config, label, created_at, created_by FROM ai_prompt_versions WHERE prompt_slug = ? AND version = ?"
    )
    .get(slug, active.version) as {
      id: number; prompt_slug: string; version: number; content: string;
      config: string; label: string; created_at: string; created_by: string;
    } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    promptSlug: row.prompt_slug,
    version: row.version,
    content: row.content,
    config: JSON.parse(row.config || "{}"),
    label: row.label,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/**
 * List all known prompt slugs with their active version metadata.
 */
export function listPromptSlugs(): PromptSlugInfo[] {
  ensureTables();
  const db = getDatabase();
  const rows = db
    .prepare(`
      SELECT a.prompt_slug, a.version, a.updated_at, v.label
      FROM ai_prompt_active a
      JOIN ai_prompt_versions v ON v.prompt_slug = a.prompt_slug AND v.version = a.version
      ORDER BY a.prompt_slug
    `)
    .all() as Array<{ prompt_slug: string; version: number; updated_at: string; label: string }>;
  return rows.map((r) => ({
    slug: r.prompt_slug,
    activeVersion: r.version,
    label: r.label,
    updatedAt: r.updated_at,
  }));
}

// ─── Muse config ─────────────────────────────────────────────────────────────

type MuseConfigRow = {
  provider: string;
  driver_model: string;
  painter_model: string;
  observe_model: string;
  tick_every: number;
  mood_size: string;
  infographic_size: string;
  mood_quality: string;
  infographic_quality: string;
  updated_at: string;
};

const MUSE_CONFIG_DEFAULTS: Omit<MuseConfig, "updatedAt"> = {
  provider: "openai",
  driverModel: process.env.OPENAI_GPT55_MODEL_ID || "gpt-5.5",
  painterModel: "gpt-image-2",
  observeModel: "gemini-2.5-flash",
  tickEvery: 3,
  moodSize: "1K",
  infographicSize: "2K",
  moodQuality: "low",
  infographicQuality: "high",
};

function rowToConfig(row: MuseConfigRow): MuseConfig {
  return {
    provider: (row.provider as "openai" | "google") ?? MUSE_CONFIG_DEFAULTS.provider,
    driverModel: row.driver_model ?? MUSE_CONFIG_DEFAULTS.driverModel,
    painterModel: row.painter_model ?? MUSE_CONFIG_DEFAULTS.painterModel,
    observeModel: row.observe_model ?? MUSE_CONFIG_DEFAULTS.observeModel,
    tickEvery: row.tick_every ?? MUSE_CONFIG_DEFAULTS.tickEvery,
    moodSize: row.mood_size ?? MUSE_CONFIG_DEFAULTS.moodSize,
    infographicSize: row.infographic_size ?? MUSE_CONFIG_DEFAULTS.infographicSize,
    moodQuality: row.mood_quality ?? MUSE_CONFIG_DEFAULTS.moodQuality,
    infographicQuality: row.infographic_quality ?? MUSE_CONFIG_DEFAULTS.infographicQuality,
    updatedAt: row.updated_at,
  };
}

export function getMuseConfig(): MuseConfig {
  ensureTables();
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM muse_config WHERE id = 1").get() as MuseConfigRow | undefined;
  if (!row) {
    return { ...MUSE_CONFIG_DEFAULTS, updatedAt: new Date().toISOString() };
  }
  return rowToConfig(row);
}

export function setMuseConfig(patch: Partial<Omit<MuseConfig, "updatedAt">>): MuseConfig {
  ensureTables();
  const db = getDatabase();
  const colMap: Record<string, string> = {
    provider: "provider",
    driverModel: "driver_model",
    painterModel: "painter_model",
    observeModel: "observe_model",
    tickEvery: "tick_every",
    moodSize: "mood_size",
    infographicSize: "infographic_size",
    moodQuality: "mood_quality",
    infographicQuality: "infographic_quality",
  };
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];
  for (const [key, col] of Object.entries(colMap)) {
    if (key in patch) {
      sets.push(`${col} = ?`);
      vals.push(patch[key as keyof typeof patch]);
    }
  }
  if (sets.length > 1) {
    db.prepare(`UPDATE muse_config SET ${sets.join(", ")} WHERE id = 1`).run(...vals);
  }
  return getMuseConfig();
}
