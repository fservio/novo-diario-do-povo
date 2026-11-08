CREATE TABLE IF NOT EXISTS evergreen_guides (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 intent_key TEXT NOT NULL UNIQUE,
 slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 brief_json TEXT NOT NULL,
 category_slug TEXT NOT NULL,
 author_id INTEGER,
 work_state TEXT NOT NULL DEFAULT 'proposed' CHECK(work_state IN ('proposed','queued','researching','blocked','review','idle')),
 publication_status TEXT NOT NULL DEFAULT 'draft' CHECK(publication_status IN ('draft','published','archived')),
 version INTEGER NOT NULL DEFAULT 0,
 published_revision_id INTEGER,
 pending_revision_id INTEGER,
 lease_token TEXT,
 lease_expires_at TEXT,
 lease_version INTEGER,
 last_error TEXT,
 last_checked_at TEXT,
 review_due_at TEXT,
 published_at TEXT,
 public_updated_at TEXT,
 review_interval_days INTEGER NOT NULL DEFAULT 90 CHECK(review_interval_days BETWEEN 1 AND 365),
 edited_by INTEGER,
 action_key TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evergreen_work_queue ON evergreen_guides(work_state,lease_expires_at,id);
CREATE INDEX IF NOT EXISTS evergreen_public ON evergreen_guides(publication_status,updated_at,id);
CREATE TABLE IF NOT EXISTS evergreen_revisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guide_id INTEGER NOT NULL REFERENCES evergreen_guides(id),
 commit_key TEXT NOT NULL UNIQUE,
 origin TEXT NOT NULL CHECK(origin IN ('ai','editorial')),
 document_json TEXT NOT NULL,
 research_json TEXT NOT NULL,
 checksum TEXT NOT NULL,
 created_by INTEGER,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evergreen_revision_guide ON evergreen_revisions(guide_id,id DESC);
CREATE TABLE IF NOT EXISTS evergreen_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 guide_id INTEGER NOT NULL REFERENCES evergreen_guides(id),
 action TEXT NOT NULL,
 actor_id INTEGER,
 version INTEGER NOT NULL,
 details TEXT,
 action_key TEXT UNIQUE,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evergreen_audit_guide ON evergreen_audit(guide_id,id DESC);
CREATE TABLE IF NOT EXISTS evergreen_news_links (
 guide_id INTEGER NOT NULL REFERENCES evergreen_guides(id),
 post_id INTEGER NOT NULL REFERENCES posts(id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(guide_id,post_id)
);
CREATE INDEX IF NOT EXISTS evergreen_links_post ON evergreen_news_links(post_id,guide_id);
