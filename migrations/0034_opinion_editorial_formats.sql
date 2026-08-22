-- Opinião passa a ser uma classificação da publicação, não apenas do autor.
ALTER TABLE posts ADD COLUMN opinion_type TEXT NOT NULL DEFAULT 'news'
  CHECK (opinion_type IN ('news', 'editorial', 'article', 'column'));

ALTER TABLE posts ADD COLUMN opinion_featured INTEGER NOT NULL DEFAULT 0
  CHECK (opinion_featured IN (0, 1));

-- Colunas e colaboradores já cadastrados mantêm sua classificação histórica.
UPDATE posts
SET opinion_type = 'column'
WHERE author_id IN (
  SELECT id FROM authors WHERE author_type = 'columnist' OR is_columnist = 1
);

UPDATE posts
SET opinion_type = 'article'
WHERE author_id IN (
  SELECT id FROM authors WHERE author_type = 'contributor'
);

-- Elimina a divergência que fazia colunistas desaparecerem da página pública.
UPDATE authors SET author_type = 'columnist' WHERE is_columnist = 1;
UPDATE authors SET is_columnist = 1 WHERE author_type = 'columnist';

CREATE INDEX idx_posts_opinion_public
  ON posts(opinion_type, status, opinion_featured DESC, published_at DESC);

CREATE INDEX idx_posts_column_archive
  ON posts(author_id, opinion_type, status, published_at DESC);
