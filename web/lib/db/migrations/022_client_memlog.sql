-- Client-side memory telemetry breaches beaconed from dev-memlog.ts.
-- Captures the spike just before a tab freeze so we can post-mortem
-- which surface (turn count, streaming state, message bytes) was
-- growing when the heap blew up.
-- received_at is written by the app as ISO 8601 UTC (Date.toISOString()),
-- so the viewer can parse it without timezone-guess heuristics.
-- No SQL DEFAULT — the application is the source of truth for this column.
CREATE TABLE IF NOT EXISTS client_memlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  trigger TEXT NOT NULL,
  user_agent TEXT,
  url TEXT,
  conversation_id INTEGER,
  sample_count INTEGER NOT NULL DEFAULT 0,
  peak_heap_mb INTEGER,
  peak_nodes INTEGER,
  samples_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_memlog_received_at
  ON client_memlog(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_memlog_session_id
  ON client_memlog(session_id);
CREATE INDEX IF NOT EXISTS idx_client_memlog_conversation_id
  ON client_memlog(conversation_id);
