CREATE TABLE news_extractor_commands (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('rss','article','sync','inspect','remove')),
 fingerprint TEXT NOT NULL,
 label TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','completed','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 available_at TEXT NOT NULL,
 lease_token TEXT,
 lease_until TEXT,
 result_json TEXT,
 last_error TEXT,
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX news_extractor_active_command ON news_extractor_commands(fingerprint) WHERE state IN ('queued','processing');
CREATE INDEX news_extractor_due ON news_extractor_commands(state,available_at,lease_until);
CREATE INDEX news_extractor_recent ON news_extractor_commands(created_at DESC);
