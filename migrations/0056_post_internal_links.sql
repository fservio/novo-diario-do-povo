CREATE TABLE post_internal_links (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  source_revision TEXT NOT NULL,
  links_json TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_post_internal_links_batch ON post_internal_links(batch_id);
