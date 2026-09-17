-- Public route performance indexes.
-- These match the filters and ordering used by home, latest, category and article rails.

CREATE INDEX IF NOT EXISTS idx_posts_public_latest
ON posts(status, seo_noindex, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_public_headline
ON posts(status, seo_noindex, is_headline DESC, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_public_category_latest
ON posts(category_id, status, seo_noindex, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_tags_tag_post
ON posts_tags(tag_id, post_id);
