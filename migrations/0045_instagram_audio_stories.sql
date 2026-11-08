CREATE TABLE IF NOT EXISTS instagram_audio_stories (
  publication_id INTEGER PRIMARY KEY REFERENCES instagram_publications(id) ON DELETE CASCADE,
  hat TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT NOT NULL DEFAULT '',
  photo_credit TEXT NOT NULL, audio_credit TEXT NOT NULL,
  image_position_x INTEGER NOT NULL DEFAULT 50, image_position_y INTEGER NOT NULL DEFAULT 50,
  audio_key TEXT NOT NULL, audio_name TEXT NOT NULL, duration_seconds REAL NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, job_id TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS instagram_audio_jobs (
  id TEXT PRIMARY KEY, publication_id INTEGER NOT NULL REFERENCES instagram_publications(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, image_key TEXT NOT NULL, audio_key TEXT NOT NULL,
  output_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','rendering','ready','failed')),
  lease_token TEXT, lease_expires_at TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, duration_seconds REAL, size_bytes INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_instagram_audio_queue ON instagram_audio_jobs(status, created_at);
CREATE TABLE IF NOT EXISTS story_renderer_config (
  id INTEGER PRIMARY KEY CHECK(id = 1), token_hash TEXT NOT NULL, last_seen_at TEXT
);
