-- Soul context taxonomy + per-label metrics (Kronus UI /api/kronus/metrics).

CREATE TABLE IF NOT EXISTS kronus_context_sections (
  section_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'soul',
  soul_config_key TEXT,
  source_tables TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kronus_context_section_metrics (
  section_key TEXT PRIMARY KEY REFERENCES kronus_context_sections(section_key),
  item_count INTEGER NOT NULL DEFAULT 0,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  breakdown_json TEXT NOT NULL DEFAULT '{}',
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kronus_context_metrics_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  stale INTEGER NOT NULL DEFAULT 1,
  computed_at TEXT
);

INSERT OR IGNORE INTO kronus_context_metrics_meta (id, stale) VALUES (1, 1);
