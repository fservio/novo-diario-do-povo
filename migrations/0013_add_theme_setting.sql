-- Migration to add public_theme setting
INSERT INTO settings (key, value_json, scope, version, updated_at)
VALUES ('public_theme', '"default"', 'public', 1, datetime('now'))
ON CONFLICT(key) DO NOTHING;
