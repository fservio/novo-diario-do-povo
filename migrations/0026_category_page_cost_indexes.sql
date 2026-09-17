-- Reduce D1 rows read for public category listing pages.
-- The public category page filters by category/status/seo_noindex/published_at
-- and orders by published_at DESC.
CREATE INDEX IF NOT EXISTS idx_posts_public_category_page
ON posts(category_id, published_at DESC)
WHERE status = 'published' AND seo_noindex = 0;
