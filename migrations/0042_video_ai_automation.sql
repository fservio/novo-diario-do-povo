-- Lease serializes the complete generation/review cycle across Workers.
CREATE TABLE IF NOT EXISTS video_ai_pipeline_locks (
  project_id INTEGER PRIMARY KEY REFERENCES video_ai_projects(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
