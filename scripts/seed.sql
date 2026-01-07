-- ============================================================================
-- Main Seed: Users, Categories, Authors, Settings, Sample Posts
-- ============================================================================

-- ============================================================================
-- 1. Admin User (PBKDF2 hash)
-- ============================================================================
-- Password: AdminPass123!
INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES
  ('admin@portal.local', 'pbkdf2_sha256$210000$Q4-buaO7hDhdffjnapj0Lg$Mp0T2mq6bFyArpK0tAEcJX1mcySwdV-zVw2dkXB3dzg', 'Admin', 'admin');

-- ============================================================================
-- 2. Categories
-- ============================================================================
INSERT OR IGNORE INTO categories (slug, name, description, is_active, display_order) VALUES
  ('brasil', 'Brasil', 'Notícias e acontecimentos do Brasil', 1, 1),
  ('economia', 'Economia', 'Economia, negócios e finanças', 1, 2),
  ('politica', 'Política', 'Política nacional e internacional', 1, 3),
  ('tecnologia', 'Tecnologia', 'Tecnologia, inovação e ciência', 1, 4),
  ('esporte', 'Esporte', 'Esportes e competições', 1, 5),
  ('cultura', 'Cultura', 'Cultura, entretenimento e artes', 1, 6);

-- ============================================================================
-- 3. Tags
-- ============================================================================
INSERT OR IGNORE INTO tags (slug, name) VALUES
  ('destaque', 'Destaque'),
  ('urgente', 'Urgente'),
  ('analise', 'Análise'),
  ('opiniao', 'Opinião');

-- ============================================================================
-- 4. Authors
-- ============================================================================
INSERT OR IGNORE INTO authors (slug, name, bio, is_active) VALUES
  ('redacao', 'Redação', 'Equipe editorial do portal', 1),
  ('colunista', 'Colunista Convidado', 'Análises e opiniões', 1);

-- ============================================================================
-- 5. Settings (Public)
-- ============================================================================
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('site_name', '"Portal Demo"', 'public'),
  ('site_description', '"Notícias e análises em tempo real"', 'public'),
  ('home_sections', '["brasil", "economia", "politica", "tecnologia"]', 'public');

-- ============================================================================
-- 6. Settings (Private - ASAAS)
-- ============================================================================
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('asaas_api_key', '""', 'private'),
  ('asaas_webhook_token', '"change-me-secret-token-min-32-chars"', 'private'),
  ('asaas.plan_map', '{"basic":"sub_xyz123"}', 'private');

-- ============================================================================
-- 7. Sample Posts
-- ============================================================================
INSERT OR IGNORE INTO posts (
  slug, title, excerpt, content, category_id, author_id, 
  status, template, is_premium, paywall_tier, published_at
) VALUES
  (
    'bem-vindo-portal-demo',
    'Bem-vindo ao Portal Demo',
    'Conheça o novo portal de notícias com tecnologia edge e paywall integrado.',
    '<p>Seja bem-vindo ao Portal Demo!</p>
     <p>Nossa plataforma utiliza tecnologia de ponta com Cloudflare Pages, 
     sistema de paywall via ASAAS e gestão completa de conteúdo via CMS.</p>
     <h2>Principais Recursos</h2>
     <ul>
       <li>Sistema de assinaturas com paywall</li>
       <li>Admin CMS para posts e configurações</li>
       <li>Performance otimizada com edge computing</li>
       <li>SEO e analytics integrados</li>
     </ul>
     <p>Explore nosso conteúdo!</p>',
    1, -- brasil
    1, -- redacao
    'published',
    'article',
    0, -- gratuito
    'free',
    datetime('now', '-1 day')
  );
