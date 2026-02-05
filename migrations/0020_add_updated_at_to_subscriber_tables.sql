-- Migration: Add updated_at to subscribers and subscriptions tables
ALTER TABLE subscribers ADD COLUMN updated_at DATETIME;
ALTER TABLE subscriptions ADD COLUMN updated_at DATETIME;
