CREATE TABLE IF NOT EXISTS neural_drafts (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  requested_by INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  draft_json TEXT CHECK (json_valid(draft_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (mission_id, execution_id) REFERENCES neural_dossiers(mission_id, execution_id)
);

CREATE INDEX IF NOT EXISTS idx_neural_drafts_execution
ON neural_drafts(mission_id, execution_id, created_at DESC);
