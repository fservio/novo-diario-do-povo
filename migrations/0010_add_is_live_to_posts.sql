-- Migration: Add is_live status to posts
ALTER TABLE posts ADD COLUMN is_live INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_is_live ON posts(is_live) WHERE is_live = 1;
