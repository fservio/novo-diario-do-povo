-- Redacao IA, radar de fontes e trilha de verificacao editorial

CREATE TABLE IF NOT EXISTS editorial_ai_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  site_url TEXT,
  source_kind TEXT NOT NULL DEFAULT 'auto',
  trust_level TEXT NOT NULL DEFAULT 'monitored',
  usage_policy TEXT NOT NULL DEFAULT 'link_only',
  attribution_label TEXT,
  allow_full_text INTEGER NOT NULL DEFAULT 0,
  allow_images INTEGER NOT NULL DEFAULT 0,
  requires_noindex INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
  etag TEXT,
  last_modified TEXT,
  last_fetched_at DATETIME,
  last_success_at DATETIME,
  last_error TEXT,
  created_by_user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (source_kind IN ('auto', 'rss', 'atom')),
  CHECK (trust_level IN ('official', 'partner', 'monitored')),
  CHECK (usage_policy IN ('link_only', 'summary', 'licensed')),
  CHECK (allow_full_text IN (0, 1)),
  CHECK (allow_images IN (0, 1)),
  CHECK (requires_noindex IN (0, 1)),
  CHECK (is_active IN (0, 1)),
  CHECK (fetch_interval_minutes BETWEEN 5 AND 10080)
);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_sources_active
  ON editorial_ai_sources(is_active, last_fetched_at);

CREATE TABLE IF NOT EXISTS editorial_ai_feed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  external_guid TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  source_content TEXT,
  author TEXT,
  published_at DATETIME,
  image_url TEXT,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  relevance_score INTEGER NOT NULL DEFAULT 0,
  ai_summary TEXT,
  ai_topics_json TEXT,
  ai_local_angle TEXT,
  rights_warning TEXT,
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES editorial_ai_sources(id) ON DELETE CASCADE,
  UNIQUE (source_id, external_guid),
  CHECK (status IN ('new', 'shortlisted', 'in_progress', 'discarded', 'converted')),
  CHECK (relevance_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_feed_items_queue
  ON editorial_ai_feed_items(status, published_at DESC, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_feed_items_source
  ON editorial_ai_feed_items(source_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_feed_items_fingerprint
  ON editorial_ai_feed_items(fingerprint);

CREATE TABLE IF NOT EXISTS editorial_ai_workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER,
  feed_item_id INTEGER,
  title TEXT NOT NULL,
  brief TEXT,
  status TEXT NOT NULL DEFAULT 'briefing',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  human_approval_required INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER NOT NULL,
  assigned_editor_user_id INTEGER,
  approved_by_user_id INTEGER,
  approved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
  FOREIGN KEY (feed_item_id) REFERENCES editorial_ai_feed_items(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_editor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (post_id),
  UNIQUE (feed_item_id),
  CHECK (status IN ('briefing', 'draft', 'fact_check', 'review', 'approved', 'archived')),
  CHECK (sensitivity IN ('normal', 'sensitive')),
  CHECK (human_approval_required IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_workspaces_status
  ON editorial_ai_workspaces(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS editorial_ai_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  label TEXT NOT NULL,
  source_url TEXT,
  content_text TEXT,
  media_id INTEGER,
  rights_basis TEXT NOT NULL DEFAULT 'internal',
  is_confidential INTEGER NOT NULL DEFAULT 0,
  created_by_user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES editorial_ai_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (kind IN ('note', 'url', 'rss', 'document', 'interview', 'official')),
  CHECK (rights_basis IN ('internal', 'link_only', 'quotation', 'licensed', 'public_record')),
  CHECK (is_confidential IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_materials_workspace
  ON editorial_ai_materials(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS editorial_ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  input_summary TEXT,
  output_json TEXT,
  provider_response_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  requested_by_user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (workspace_id) REFERENCES editorial_ai_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (action IN ('triage', 'draft', 'fact_check', 'rewrite', 'seo')),
  CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_runs_workspace
  ON editorial_ai_runs(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS editorial_ai_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  run_id INTEGER,
  title TEXT NOT NULL,
  hat TEXT,
  excerpt TEXT,
  content_markdown TEXT NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  originality_note TEXT,
  created_by_user_id INTEGER NOT NULL,
  applied_to_post_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES editorial_ai_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES editorial_ai_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_revisions_workspace
  ON editorial_ai_revisions(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS editorial_ai_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  revision_id INTEGER,
  run_id INTEGER,
  claim_text TEXT NOT NULL,
  evidence_text TEXT,
  source_label TEXT,
  source_url TEXT,
  source_locator TEXT,
  status TEXT NOT NULL DEFAULT 'needs_review',
  confidence INTEGER NOT NULL DEFAULT 0,
  reviewer_user_id INTEGER,
  reviewed_at DATETIME,
  reviewer_note TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES editorial_ai_workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (revision_id) REFERENCES editorial_ai_revisions(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES editorial_ai_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CHECK (status IN ('confirmed', 'divergent', 'unsupported', 'needs_review', 'reviewed')),
  CHECK (confidence BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_claims_workspace
  ON editorial_ai_claims(workspace_id, status, created_at DESC);
