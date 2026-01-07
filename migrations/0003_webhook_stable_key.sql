-- ============================================================================
-- Migration: Webhook Hybrid Idempotency (stable_key)
-- ============================================================================

-- Add stable_key column to webhook_events
ALTER TABLE webhook_events ADD COLUMN stable_key TEXT;

-- Create index for stable_key lookups (partial unique not supported in D1)
-- We'll handle uniqueness check in code: SELECT WHERE provider = ? AND stable_key = ?
CREATE INDEX IF NOT EXISTS idx_webhook_stable_key ON webhook_events(provider, stable_key);
