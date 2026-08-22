-- Migration: Expand webhook_events for better observability and idempotency
-- These columns are already present when applying from a clean database:
-- - 0001_initial_schema.sql creates provider, payload_json, status and created_at.
-- - 0003_webhook_stable_key.sql adds stable_key.
-- Keep this migration non-destructive for fresh local D1 rebuilds.

-- Add unique index on stable_key for race-free idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_stable_key ON webhook_events(stable_key) WHERE stable_key IS NOT NULL;
