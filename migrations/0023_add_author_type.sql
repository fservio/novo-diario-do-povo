-- ============================================================================
-- Migration: 0023_add_author_type.sql
-- Descrição: Adiciona o tipo de autor (staff, columnist, editorial, contributor)
-- ============================================================================

-- 1. Adicionar coluna author_type com valor default 'staff'
ALTER TABLE authors ADD COLUMN author_type TEXT NOT NULL DEFAULT 'staff';

-- 2. Criar índice para performance
CREATE INDEX idx_authors_type ON authors(author_type);

-- 3. Migrar autores que já são colunistas (is_columnist = 1) para o novo tipo
UPDATE authors SET author_type = 'columnist' WHERE is_columnist = 1;

-- 4. Identificar autores automáticos do sistema (como 'Redação') se existirem
-- Se o slug for 'redacao', definimos como 'editorial'
UPDATE authors SET author_type = 'editorial' WHERE slug = 'redacao';

-- Opcional: Adicionar chapéu Artigo de Opinião para categorias específicas no futuro
-- se necessário, mas por enquanto focamos no author_type.
