-- Instagram editorial workflow, human approval and publication ledger

CREATE TABLE IF NOT EXISTS instagram_publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  format TEXT NOT NULL DEFAULT 'feed_4x5',
  template TEXT NOT NULL DEFAULT 'editorial_overlay',
  hat TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  caption TEXT,
  hashtags TEXT,
  alt_text TEXT,
  render_token TEXT NOT NULL UNIQUE,
  output_image_url TEXT,
  scheduled_at DATETIME,
  n8n_execution_id TEXT,
  meta_container_id TEXT,
  meta_media_id TEXT,
  permalink TEXT,
  last_error TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER NOT NULL,
  approved_by_user_id INTEGER,
  approved_at DATETIME,
  published_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (status IN ('draft', 'caption_ready', 'approved', 'scheduled', 'publishing', 'published', 'failed')),
  CHECK (format IN ('feed_4x5'))
);

CREATE INDEX IF NOT EXISTS idx_instagram_publications_status
  ON instagram_publications(status, scheduled_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_instagram_publications_post
  ON instagram_publications(post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS instagram_publication_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_reference TEXT,
  error_message TEXT,
  response_json TEXT,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES instagram_publications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_instagram_attempts_publication
  ON instagram_publication_attempts(publication_id, attempted_at DESC);
