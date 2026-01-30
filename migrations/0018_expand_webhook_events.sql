-- Migration: Expand webhook_events for better observability and idempotency
ALTER TABLE webhook_events ADD COLUMN provider TEXT DEFAULT 'asaas';
ALTER TABLE webhook_events ADD COLUMN payload_json TEXT;
ALTER TABLE webhook_events ADD COLUMN stable_key TEXT;
ALTER TABLE webhook_events ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE webhook_events ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Add unique index on stable_key for race-free idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_stable_key ON webhook_events(stable_key) WHERE stable_key IS NOT NULL;
