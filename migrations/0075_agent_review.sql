CREATE TABLE IF NOT EXISTS agent_review_queue (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  evidence TEXT NOT NULL,
  automatic INTEGER NOT NULL CHECK(automatic IN (0, 1)),
  token TEXT,
  lease_until TEXT,
  result TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_review_queue_due ON agent_review_queue(lease_until, post_id)
WHERE automatic = 1 AND result IS NULL;
