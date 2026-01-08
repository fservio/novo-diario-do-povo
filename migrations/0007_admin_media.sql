-- ============================================================================
-- Add soft delete and updated_at to media table
-- ============================================================================

ALTER TABLE media ADD COLUMN deleted_at DATETIME;
ALTER TABLE media ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Index for filtering deleted media
CREATE INDEX IF NOT EXISTS idx_media_deleted_at ON media(deleted_at) WHERE deleted_at IS NULL;

-- Update trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_media_timestamp 
AFTER UPDATE ON media
FOR EACH ROW
BEGIN
  UPDATE media SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
