CREATE TABLE IF NOT EXISTS cultural_suggestions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 fingerprint TEXT NOT NULL UNIQUE,
 organizer_name TEXT NOT NULL,
 organizer_email TEXT NOT NULL,
 event_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 created_at TEXT NOT NULL,
 reviewed_at TEXT,
 reviewed_by INTEGER,
 event_slug TEXT
 ,review_note TEXT
 ,consent_version TEXT NOT NULL DEFAULT 'culture-suggestion-v1'
);
CREATE INDEX IF NOT EXISTS cultural_suggestions_queue ON cultural_suggestions(status,created_at);
CREATE TABLE IF NOT EXISTS cultural_suggestion_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS cultural_suggestion_limits_expiry ON cultural_suggestion_limits(expires_at);
