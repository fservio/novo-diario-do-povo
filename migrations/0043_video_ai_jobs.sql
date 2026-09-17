CREATE TABLE IF NOT EXISTS video_ai_jobs (
  id TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES video_ai_projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'failed')),
  stage TEXT NOT NULL CHECK(stage IN ('generate', 'review')),
  attempts INTEGER NOT NULL DEFAULT 0,
  version_id INTEGER REFERENCES video_ai_versions(id),
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_ai_jobs_active ON video_ai_jobs(project_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_video_ai_jobs_pending ON video_ai_jobs(status, updated_at);
