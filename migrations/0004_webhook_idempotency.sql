-- ============================================================================
-- Migration: Webhook Idempotency Table (Race-Free)
-- ============================================================================
-- Purpose: Prevent duplicate webhook processing with race-free guarantees
-- Strategy: Use PRIMARY KEY (provider, stable_key) to block concurrent inserts

CREATE TABLE IF NOT EXISTS webhook_idempotency (
  provider TEXT NOT NULL,           -- 'asaas', etc.
  stable_key TEXT NOT NULL,         -- 'asaas:<eventType>:<entityId>'
  event_id TEXT NOT NULL,           -- SHA-256 hash (payload_hash)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  PRIMARY KEY (provider, stable_key)
);

-- Index for lookup by event_id (optional, for debugging)
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_event_id 
ON webhook_idempotency(event_id);

-- ============================================================================
-- Usage:
-- ============================================================================
-- 1. Try INSERT INTO webhook_idempotency (provider, stable_key, event_id)
-- 2. If PRIMARY KEY collision → return "already processed (stable_key)"
-- 3. Else → continue processing and insert into webhook_events
-- 4. This eliminates SELECT + INSERT race condition
