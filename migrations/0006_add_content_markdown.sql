-- ============================================================================
-- Add content_markdown for Markdown support
-- Backward compatible: NULL = use HTML content
-- ============================================================================

ALTER TABLE posts ADD COLUMN content_markdown TEXT;

-- Add index for quick markdown detection
CREATE INDEX IF NOT EXISTS idx_posts_content_markdown ON posts(content_markdown) WHERE content_markdown IS NOT NULL;
