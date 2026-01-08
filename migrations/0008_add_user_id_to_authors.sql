-- ============================================================================
-- Migration: 0008_add_user_id_to_authors.sql
-- Descrição: Adiciona user_id em authors para vínculo direto users <-> authors
-- ============================================================================

-- Adicionar coluna user_id (nullable para manter autores sem user)
ALTER TABLE authors ADD COLUMN user_id INTEGER;

-- Criar foreign key
CREATE INDEX idx_authors_user_id ON authors(user_id);

-- Migrar autores existentes que têm email
-- Conecta authors com users pelo email
UPDATE authors
SET user_id = (
  SELECT id FROM users WHERE users.email = authors.email LIMIT 1
)
WHERE authors.email IS NOT NULL;

-- ============================================================================
-- Role-based permissions (documentação)
-- ============================================================================

-- IMPORTANTE: Os roles são definidos na tabela users:
-- - 'redator': Pode criar drafts, mas NÃO pode publicar
-- - 'editor': Pode criar, editar e publicar posts
-- - 'diretor': Pode criar, editar, publicar e gerenciar categorias
-- - 'admin': Acesso total (users, categories, posts, settings)

-- A lógica de permissões é implementada no código, não no banco.
-- O vínculo user_id em authors permite:
-- 1. Criar autor automaticamente ao criar user
-- 2. Aplicar permissões baseadas em user.role
-- 3. Manter autores "editoriais" sem user (Redação, Colunista, etc)

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
