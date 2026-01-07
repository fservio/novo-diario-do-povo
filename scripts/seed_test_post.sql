-- Test Post Seed for Production

-- Create user
INSERT OR IGNORE INTO users (id, email, name, role, created_at) 
VALUES (1, 'admin@example.com', 'Admin', 'admin', datetime('now'));

-- Create category
INSERT OR IGNORE INTO categories (id, name, slug, description, created_at) 
VALUES (1, 'Brasil', 'brasil', 'Notícias nacionais', datetime('now'));

-- Create post without image
INSERT OR IGNORE INTO posts (
  slug, title, excerpt, content, category_id, author_id,
  status, published_at, created_at, updated_at
) VALUES (
  'bem-vindo-ao-jornal',
  'Bem-vindo ao Jornal', 
  'Este é o primeiro post do nosso portal de notícias.',
  '<p>Bem-vindo ao nosso portal de notícias!</p><p>Aqui você encontrará as principais notícias do Brasil e do mundo.</p>',
  1,
  1,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

SELECT 'Post criado:', id, title FROM posts WHERE slug = 'bem-vindo-ao-jornal';
