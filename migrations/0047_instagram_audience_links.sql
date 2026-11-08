ALTER TABLE instagram_oauth_states ADD COLUMN requested_scopes TEXT;
ALTER TABLE instagram_connections ADD COLUMN granted_scopes TEXT;
CREATE TABLE instagram_audience_sync (
  account_id TEXT PRIMARY KEY,
  requested_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  next_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  error TEXT,
  data_json TEXT,
  subscribed_at TEXT,
  subscription_error TEXT
);
CREATE TABLE instagram_audience_daily (
  account_id TEXT NOT NULL,
  day TEXT NOT NULL,
  followers INTEGER NOT NULL,
  captured_at TEXT NOT NULL,
  PRIMARY KEY(account_id,day)
);
CREATE TABLE instagram_media_insights (
  media_id TEXT PRIMARY KEY,
  publication_id INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  data_json TEXT,
  fetched_at TEXT,
  attempted_at TEXT NOT NULL,
  error TEXT
);
CREATE TABLE instagram_link_campaigns (
  publication_id INTEGER PRIMARY KEY REFERENCES instagram_publications(id),
  account_id TEXT NOT NULL,
  media_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 0,
  enabled_at TEXT,
  article_url TEXT NOT NULL,
  link_token TEXT NOT NULL UNIQUE,
  opens INTEGER NOT NULL DEFAULT 0,
  poll_cursor TEXT,
  poll_at TEXT,
  poll_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE instagram_link_replies (
  comment_id TEXT PRIMARY KEY,
  publication_id INTEGER NOT NULL REFERENCES instagram_link_campaigns(publication_id),
  author_hash TEXT NOT NULL,
  commented_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','uncertain','skipped')),
  started_at TEXT,
  message_id TEXT,
  error TEXT,
  UNIQUE(publication_id,author_hash)
);
CREATE INDEX instagram_link_queue ON instagram_link_replies(status,received_at);
CREATE INDEX instagram_media_account ON instagram_media_insights(account_id,publication_id);
