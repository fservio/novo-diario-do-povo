CREATE TABLE IF NOT EXISTS editorial_reporter_pilot_runs (
  execution_id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_editorial_reporter_pilot_mission
  ON editorial_reporter_pilot_runs (mission_id, created_at DESC);
