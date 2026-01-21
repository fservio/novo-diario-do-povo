-- Migration: Add is_headline column to posts table
ALTER TABLE posts ADD COLUMN is_headline INTEGER DEFAULT 0;
