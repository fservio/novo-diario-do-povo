-- Migration: Add Google Analytics Setting to CMS
-- This setting is required for the admin panel to display the field for editing.

INSERT INTO settings (key, value_json, scope, version, updated_at)
VALUES ('google_analytics_id', '"G-XXXXXXXXXX"', 'public', 1, datetime('now'))
ON CONFLICT(key) DO NOTHING;
