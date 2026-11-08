CREATE TABLE instagram_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  token_cipher TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE instagram_oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  session_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE instagram_direct_jobs (
  id TEXT PRIMARY KEY,
  publication_id INTEGER NOT NULL REFERENCES instagram_publications(id),
  version INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  image_key TEXT NOT NULL,
  image_token TEXT NOT NULL UNIQUE,
  caption TEXT NOT NULL,
  alt_text TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','published','failed','uncertain')),
  container_id TEXT,
  media_id TEXT,
  last_error TEXT,
  started_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(publication_id, version)
);
CREATE INDEX instagram_direct_due ON instagram_direct_jobs(status, scheduled_at);
