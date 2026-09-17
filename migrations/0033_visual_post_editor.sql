-- Editor visual estruturado, concorrencia otimista e historico editorial

ALTER TABLE posts ADD COLUMN content_json TEXT;
ALTER TABLE posts ADD COLUMN content_format TEXT NOT NULL DEFAULT 'legacy'
  CHECK (content_format IN ('legacy', 'markdown', 'visual'));
ALTER TABLE posts ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;

UPDATE posts
SET content_format = 'markdown'
WHERE content_markdown IS NOT NULL AND length(trim(content_markdown)) > 0;

ALTER TABLE post_revisions ADD COLUMN content_json TEXT;
ALTER TABLE post_revisions ADD COLUMN content_format TEXT NOT NULL DEFAULT 'legacy'
  CHECK (content_format IN ('legacy', 'markdown', 'visual'));
ALTER TABLE post_revisions ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE post_revisions ADD COLUMN revision_type TEXT NOT NULL DEFAULT 'manual'
  CHECK (revision_type IN ('manual', 'autosave', 'restore', 'ai'));

CREATE INDEX IF NOT EXISTS idx_post_revisions_history
  ON post_revisions(post_id, created_at DESC);
