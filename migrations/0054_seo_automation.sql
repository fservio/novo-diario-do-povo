ALTER TABLE posts ADD COLUMN seo_primary_keyword TEXT;
ALTER TABLE posts ADD COLUMN seo_secondary_keywords TEXT NOT NULL DEFAULT '[]';
ALTER TABLE posts ADD COLUMN seo_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN seo_updated_at TEXT;

CREATE TABLE seo_automation_config (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
 activated_at TEXT, daily_limit INTEGER NOT NULL DEFAULT 300,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO seo_automation_config(id) VALUES(1);
CREATE TABLE post_seo_revisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 operation_key TEXT NOT NULL UNIQUE, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
 source_snapshot TEXT NOT NULL, evidence_json TEXT NOT NULL DEFAULT '{}',
 reason TEXT NOT NULL, actor TEXT NOT NULL, restored_from INTEGER,
 created_at TEXT NOT NULL
);
CREATE INDEX post_seo_revisions_post ON post_seo_revisions(post_id,id DESC);
CREATE TABLE seo_pilots (
 id INTEGER PRIMARY KEY AUTOINCREMENT, seed TEXT NOT NULL UNIQUE,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, created_at TEXT NOT NULL, prepared INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE seo_pilot_members (
 pilot_id INTEGER NOT NULL REFERENCES seo_pilots(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 pair_number INTEGER NOT NULL, arm TEXT NOT NULL CHECK(arm IN ('treatment','control')),
 baseline_json TEXT NOT NULL, PRIMARY KEY(pilot_id,post_id)
);
CREATE TABLE seo_pilot_followups (
 pilot_id INTEGER NOT NULL REFERENCES seo_pilots(id) ON DELETE CASCADE, window_days INTEGER NOT NULL CHECK(window_days IN (14,28)),
 metrics_json TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(pilot_id,window_days)
);
CREATE TABLE post_seo_jobs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('new','pilot')), pilot_id INTEGER,
 state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until TEXT, snapshot_json TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, next_attempt_at TEXT,
 last_error TEXT, receipt_json TEXT, source_key TEXT NOT NULL,
 UNIQUE(post_id,source_key)
);
CREATE INDEX post_seo_jobs_due ON post_seo_jobs(state,next_attempt_at,id);
CREATE TABLE seo_daily_usage (day TEXT PRIMARY KEY, generations INTEGER NOT NULL DEFAULT 0);
CREATE TABLE seo_job_receipts (
 operation_key TEXT PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES post_seo_jobs(id) ON DELETE CASCADE,
 lease_token TEXT NOT NULL, receipt_json TEXT NOT NULL, created_at TEXT NOT NULL
);
