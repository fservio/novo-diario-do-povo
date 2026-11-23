CREATE TABLE special_briefs (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  attempt TEXT NOT NULL
);
CREATE INDEX special_briefs_recent ON special_briefs(created_at DESC) WHERE result_json IS NOT NULL;
