-- ============================================================================
-- Migration: 0009_add_post_hat.sql
-- Descrição: adiciona coluna "hat" (chapéu) para posts
-- ============================================================================

ALTER TABLE posts
  ADD COLUMN hat TEXT;
