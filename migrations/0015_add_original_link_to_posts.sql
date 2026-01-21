ALTER TABLE posts ADD COLUMN original_link TEXT;
CREATE INDEX idx_posts_original_link ON posts(original_link);
