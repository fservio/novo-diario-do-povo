ALTER TABLE cultural_events ADD COLUMN origin TEXT NOT NULL DEFAULT 'automation';
ALTER TABLE cultural_events ADD COLUMN editorial_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cultural_events ADD COLUMN edited_by INTEGER;
ALTER TABLE cultural_events ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cultural_events ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
UPDATE cultural_events SET origin='organizer',editorial_locked=1 WHERE slug LIKE 'organizadores-%';
CREATE TABLE IF NOT EXISTS daily_editorial_editions (
 date TEXT PRIMARY KEY,
 automatic_json TEXT,
 editorial_json TEXT,
 revision INTEGER NOT NULL DEFAULT 0,
 edited_by INTEGER,
 edited_at TEXT
);
CREATE TABLE IF NOT EXISTS daily_management_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 resource TEXT NOT NULL,
 resource_key TEXT NOT NULL,
 action TEXT NOT NULL,
 actor_id INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 snapshot_json TEXT
);
CREATE INDEX IF NOT EXISTS daily_management_audit_resource ON daily_management_audit(resource,resource_key,id DESC);
