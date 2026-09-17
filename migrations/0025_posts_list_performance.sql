-- Performance optimization for post listing queries (admin and internal)
-- These indexes resolve the "443M rows read" issue by allowing efficient filtering and sorting.

-- Supports: WHERE status = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_posts_status_created_at ON posts(status, created_at DESC);

-- Supports: ORDER BY created_at DESC (All posts view)
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON posts(created_at DESC);

-- Supports: WHERE category_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_posts_category_created_at ON posts(category_id, created_at DESC);
