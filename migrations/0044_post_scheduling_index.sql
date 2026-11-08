-- Only queued drafts are scanned by the once-per-minute publication worker.
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_publication
  ON posts(scheduled_at, id)
  WHERE status = 'draft' AND scheduled_at IS NOT NULL;
