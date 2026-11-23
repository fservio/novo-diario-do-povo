CREATE TABLE IF NOT EXISTS neural_followups (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  requested_by INTEGER NOT NULL,
  questions_json TEXT NOT NULL CHECK (json_valid(questions_json)),
  result_json TEXT CHECK (json_valid(result_json)),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  rounds INTEGER NOT NULL DEFAULT 0 CHECK (rounds BETWEEN 0 AND 2),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (mission_id, execution_id) REFERENCES neural_dossiers(mission_id, execution_id)
);

CREATE INDEX IF NOT EXISTS idx_neural_followups_execution
ON neural_followups(mission_id, execution_id, created_at DESC);
