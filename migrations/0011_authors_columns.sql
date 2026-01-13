-- Migration: Add Columns/Opinion support to Authors
ALTER TABLE authors ADD COLUMN is_columnist INTEGER DEFAULT 0;
ALTER TABLE authors ADD COLUMN column_name TEXT;
ALTER TABLE authors ADD COLUMN column_description TEXT;
