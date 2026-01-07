-- ============================================================================
-- Migration: 0005_staff_roles.sql
-- Descrição: Adicionar campos para gerenciamento de staff (director, editor, writer)
-- ============================================================================

-- Adicionar coluna must_change_password (force password reset on first login)
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

-- Adicionar coluna last_login_at (track last login timestamp)
ALTER TABLE users ADD COLUMN last_login_at DATETIME;

-- Criar índice para is_active (otimizar queries de staff ativo)
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- ============================================================================
-- NOTA: A coluna 'role' já existe e suporta qualquer TEXT
-- Roles suportados: director, editor, writer
-- Compatibilidade: 'admin' será tratado como 'director' no código
-- ============================================================================
