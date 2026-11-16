CREATE TABLE IF NOT EXISTS editorial_post_updates (
  source_url TEXT PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  previous_snapshot TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_post_updates_post
  ON editorial_post_updates(post_id, applied_at DESC);
