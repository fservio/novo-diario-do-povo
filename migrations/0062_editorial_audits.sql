CREATE TABLE editorial_audits (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  audited_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id),
  resolution TEXT,
  UNIQUE(post_id, version)
);
CREATE INDEX idx_editorial_audits_recent ON editorial_audits(audited_at DESC, id DESC);
