CREATE TABLE IF NOT EXISTS post_related_articles (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  related_post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, related_post_id),
  CHECK (post_id < related_post_id)
);
CREATE INDEX IF NOT EXISTS post_related_articles_reverse ON post_related_articles(related_post_id,post_id);
