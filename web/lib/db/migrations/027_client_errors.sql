-- Client-side JS errors beaconed from dev-client-errors.ts (dev only).
-- Complements client_memlog (heap) with stack traces + context for post-mortems.

CREATE TABLE IF NOT EXISTS client_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  source TEXT,
  lineno INTEGER,
  colno INTEGER,
  url TEXT,
  user_agent TEXT,
  conversation_id INTEGER,
  context_json TEXT,
  mem_tail_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_errors_received_at
  ON client_errors(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_session_id
  ON client_errors(session_id);
CREATE INDEX IF NOT EXISTS idx_client_errors_conversation_id
  ON client_errors(conversation_id);
