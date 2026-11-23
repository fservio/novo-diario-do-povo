CREATE TABLE IF NOT EXISTS neural_draft_steps (
  draft_id TEXT NOT NULL REFERENCES neural_drafts(id),
  stage TEXT NOT NULL,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at INTEGER,
  outcome TEXT CHECK (outcome IN ('completed', 'failed')),
  result_json TEXT CHECK (json_valid(result_json)),
  PRIMARY KEY (draft_id, stage)
);
