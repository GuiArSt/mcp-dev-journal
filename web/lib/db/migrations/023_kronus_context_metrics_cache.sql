-- Cached Kronus soul-context section counts + token estimates (recomputed when stale).
CREATE TABLE IF NOT EXISTS kronus_context_metrics_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload_json TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  stale INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO kronus_context_metrics_cache (id, payload_json, stale)
VALUES (1, '{}', 1);
