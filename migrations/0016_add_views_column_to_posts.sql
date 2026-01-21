ALTER TABLE posts ADD COLUMN views INTEGER DEFAULT 0;
CREATE INDEX idx_posts_views ON posts(views);
