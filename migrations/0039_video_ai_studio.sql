-- Estúdio de Vídeo IA: avatares jornalísticos, roteiros, versões e auditoria

CREATE TABLE IF NOT EXISTS video_ai_avatars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('anchor', 'reporter', 'commentator')),
  external_label TEXT,
  speaking_style TEXT,
  pronunciation_notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_video_ai_avatars_role
  ON video_ai_avatars(role, is_active, name);

CREATE TABLE IF NOT EXISTS video_ai_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  internal_title TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('bulletin', 'report', 'explainer', 'commentary')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'ready', 'archived')),
  duration_seconds INTEGER NOT NULL DEFAULT 90 CHECK (duration_seconds BETWEEN 20 AND 600),
  orientation TEXT NOT NULL DEFAULT 'vertical' CHECK (orientation IN ('vertical', 'horizontal', 'square')),
  tone TEXT NOT NULL DEFAULT 'factual' CHECK (tone IN ('factual', 'didactic', 'urgent', 'analytical', 'conversational')),
  target_audience TEXT,
  editorial_instructions TEXT,
  closing_cta TEXT,
  anchor_avatar_id INTEGER,
  reporter_avatar_id INTEGER,
  commentator_avatar_id INTEGER,
  source_snapshot_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_updated_at DATETIME,
  created_by_user_id INTEGER,
  approved_by_user_id INTEGER,
  approved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE RESTRICT,
  FOREIGN KEY (anchor_avatar_id) REFERENCES video_ai_avatars(id) ON DELETE SET NULL,
  FOREIGN KEY (reporter_avatar_id) REFERENCES video_ai_avatars(id) ON DELETE SET NULL,
  FOREIGN KEY (commentator_avatar_id) REFERENCES video_ai_avatars(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_video_ai_projects_status
  ON video_ai_projects(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_ai_projects_post
  ON video_ai_projects(post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS video_ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('generate', 'review')),
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  output_json TEXT,
  provider_response_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  requested_by_user_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES video_ai_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_video_ai_runs_project
  ON video_ai_runs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS video_ai_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  run_id INTEGER,
  version_number INTEGER NOT NULL,
  script_json TEXT NOT NULL,
  review_json TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  estimated_seconds INTEGER NOT NULL DEFAULT 0,
  is_human_edited INTEGER NOT NULL DEFAULT 0 CHECK (is_human_edited IN (0, 1)),
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, version_number),
  FOREIGN KEY (project_id) REFERENCES video_ai_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES video_ai_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_video_ai_versions_project
  ON video_ai_versions(project_id, version_number DESC);
