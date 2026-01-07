-- ============================================================================
-- Seed Script: Dados iniciais para o jornal
-- ============================================================================

-- ============================================================================
-- 1. Categories (Editorias)
-- ============================================================================

INSERT OR IGNORE INTO categories (slug, name, description, is_active, display_order) VALUES
  ('politica', 'Política', 'Notícias sobre política nacional e internacional', 1, 1),
  ('economia', 'Economia', 'Economia, negócios e finanças', 1, 2),
  ('brasil', 'Brasil', 'Notícias gerais do Brasil', 1, 3),
  ('mundo', 'Mundo', 'Notícias internacionais', 1, 4),
  ('esportes', 'Esportes', 'Cobertura esportiva completa', 1, 5),
  ('tecnologia', 'Tecnologia', 'Tecnologia, inovação e ciência', 1, 6),
  ('saude', 'Saúde', 'Saúde e bem-estar', 1, 7),
  ('cultura', 'Cultura', 'Cultura, artes e entretenimento', 1, 8),
  ('entretenimento', 'Entretenimento', 'Entretenimento e celebridades', 1, 9),
  ('opiniao', 'Opinião', 'Artigos de opinião e colunas', 1, 10);

-- ============================================================================
-- 2. Authors
-- ============================================================================

INSERT OR IGNORE INTO authors (slug, name, bio, is_active) VALUES
  ('redacao', 'Redação', 'Equipe editorial do jornal', 1),
  ('joao-silva', 'João Silva', 'Jornalista especializado em política', 1),
  ('maria-santos', 'Maria Santos', 'Repórter de economia e negócios', 1),
  ('pedro-oliveira', 'Pedro Oliveira', 'Colunista de tecnologia', 1),
  ('ana-costa', 'Ana Costa', 'Correspondente internacional', 1);

-- ============================================================================
-- 3. Tags
-- ============================================================================

INSERT OR IGNORE INTO tags (slug, name) VALUES
  ('breaking-news', 'Breaking News'),
  ('eleicoes', 'Eleições'),
  ('mercado-financeiro', 'Mercado Financeiro'),
  ('copa-do-mundo', 'Copa do Mundo'),
  ('inteligencia-artificial', 'Inteligência Artificial'),
  ('covid-19', 'COVID-19'),
  ('meio-ambiente', 'Meio Ambiente'),
  ('educacao', 'Educação'),
  ('seguranca-publica', 'Segurança Pública'),
  ('cinema', 'Cinema');

-- ============================================================================
-- 4. Plans (Assinatura)
-- ============================================================================

INSERT OR IGNORE INTO plans (slug, name, description, price_cents, currency, billing_cycle, trial_days, benefits_json, is_active, display_order) VALUES
  ('mensal', 'Mensal', 'Acesso completo mensal', 1490, 'BRL', 'monthly', 0, 
   '["Acesso ilimitado a todas as editorias","Experiência com menos anúncios","Newsletter exclusiva"]', 1, 1),
  ('anual', 'Anual', 'Acesso completo anual com economia', 14990, 'BRL', 'yearly', 7, 
   '["Acesso ilimitado a todas as editorias","Experiência premium com anúncios reduzidos","Newsletter exclusiva","Economia de 2 meses"]', 1, 2);

-- ============================================================================
-- 5. Settings (Global Configurations)
-- ============================================================================

-- Site info
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('site_name', '"Jornal Demo"', 'public'),
  ('site_description', '"Portal de notícias em tempo real"', 'public'),
  ('site_email', '"contato@jornaldemo.com"', 'public');

-- Paywall rules
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('paywall_rules', '{
    "mode": "metered",
    "meter_limit": 5,
    "meter_window": "monthly",
    "meter_soft_cta_at": 2,
    "lock_after_ratio_mobile": 0.22,
    "lock_after_ratio_desktop": 0.30,
    "exempt_templates": ["live", "stories"]
  }', 'public');

-- Category-specific paywall rules
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('paywall_rules_category_opiniao', '{"mode": "hard"}', 'public'),
  ('paywall_rules_category_economia', '{"mode": "metered", "meter_limit": 3}', 'public'),
  ('paywall_rules_category_esportes', '{"mode": "free"}', 'public');

-- SEO
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('robots_disallow', '["/admin", "/api/admin", "/conta"]', 'public');

-- Ads config (exemplo)
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('adsense_enabled', 'false', 'public'),
  ('gam_enabled', 'false', 'public');

-- Newsletter
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('newsletter_enabled', 'true', 'public'),
  ('newsletter_provider', '"internal"', 'public');

-- n8n
INSERT OR IGNORE INTO settings (key, value_json, scope) VALUES
  ('n8n_enabled', 'true', 'public'),
  ('n8n_auto_publish', 'false', 'public');

-- ============================================================================
-- 6. Ad Slots Configuration
-- ============================================================================

INSERT OR IGNORE INTO ads_slots (slot_id, template, position, sizes_json, lazy, placeholder_enabled, is_active) VALUES
  ('home_top_leaderboard', 'home', 'top', 
   '{"desktop": [[970,250],[728,90]], "mobile": [[320,100],[320,50]]}', 0, 1, 1),
  ('home_infeed_1', 'home', 'infeed_1',
   '{"desktop": [[300,250],[336,280]], "mobile": [[300,250]]}', 1, 1, 1),
  ('article_top', 'article', 'top',
   '{"desktop": [[728,90],[970,90]], "mobile": [[320,100],[320,50]]}', 0, 1, 1),
  ('article_inread_1', 'article', 'inread_1',
   '{"desktop": [[300,250],[336,280]], "mobile": [[300,250]]}', 1, 1, 1),
  ('article_inread_2', 'article', 'inread_2',
   '{"desktop": [[300,250],[336,280]], "mobile": [[300,250]]}', 1, 1, 1),
  ('article_sticky_mobile', 'article', 'sticky_mobile',
   '{"mobile": [[320,50],[320,100]]}', 0, 1, 1);

-- ============================================================================
-- 7. Sample Posts
-- ============================================================================

INSERT OR IGNORE INTO posts (
  slug, title, excerpt, content, category_id, author_id, 
  status, template, is_premium, paywall_tier, published_at
) VALUES
  (
    'bem-vindo-ao-jornal-demo',
    'Bem-vindo ao Jornal Demo',
    'Conheça o novo portal de notícias em tempo real com conteúdo de qualidade.',
    '<p>Seja bem-vindo ao Jornal Demo, seu novo portal de notícias em tempo real!</p>
     <p>Nosso compromisso é trazer informação de qualidade, análises aprofundadas e cobertura completa dos principais acontecimentos do Brasil e do mundo.</p>
     <p>Explore nossas editorias de Política, Economia, Tecnologia, Esportes e muito mais.</p>
     <h2>Nossa Missão</h2>
     <p>Produzir jornalismo independente, ético e relevante para nossos leitores.</p>
     <p>Conte conosco!</p>',
    3, -- Brasil
    1, -- Redação
    'published',
    'article',
    0, -- não premium
    'free',
    datetime('now', '-1 day')
  ),
  (
    'economia-aquecida-no-primeiro-trimestre',
    'Economia aquecida no primeiro trimestre de 2024',
    'Indicadores econômicos mostram crescimento significativo nos primeiros meses do ano.',
    '<p>A economia brasileira apresentou crescimento robusto no primeiro trimestre de 2024, superando as expectativas do mercado.</p>
     <p>Segundo dados do IBGE, o PIB cresceu 1,2% no período, impulsionado principalmente pelo setor de serviços.</p>
     <h2>Setor de Serviços Lidera</h2>
     <p>O setor de serviços foi o principal motor do crescimento, com alta de 1,5%. A indústria também contribuiu positivamente, com expansão de 0,8%.</p>
     <p>Analistas projetam que o crescimento deve se manter ao longo do ano, com inflação controlada.</p>',
    2, -- Economia
    3, -- Maria Santos
    'published',
    'article',
    1, -- premium
    'metered',
    datetime('now', '-2 hours')
  ),
  (
    'revolucao-ia-generativa',
    'A revolução da IA generativa transforma o mercado de tecnologia',
    'Inteligência artificial generativa está mudando a forma como empresas e profissionais trabalham.',
    '<p>A inteligência artificial generativa está revolucionando diversos setores da economia, desde criação de conteúdo até programação e design.</p>
     <p>Empresas ao redor do mundo estão adotando ferramentas de IA para aumentar produtividade e inovar em seus produtos e serviços.</p>
     <h2>Oportunidades e Desafios</h2>
     <p>Especialistas apontam que, apesar das enormes oportunidades, existem desafios éticos e de regulamentação a serem enfrentados.</p>
     <p>O debate sobre direitos autorais, privacidade e impacto no mercado de trabalho está apenas começando.</p>',
    6, -- Tecnologia
    4, -- Pedro Oliveira
    'published',
    'article',
    1, -- premium
    'metered',
    datetime('now', '-5 hours')
  );

-- ============================================================================
-- 8. Pages (estáticas)
-- ============================================================================

INSERT OR IGNORE INTO pages (slug, title, content, is_active) VALUES
  ('termos', 'Termos de Uso', 
   '<h1>Termos de Uso</h1><p>Bem-vindo ao Jornal Demo...</p>', 1),
  ('privacidade', 'Política de Privacidade',
   '<h1>Política de Privacidade</h1><p>Sua privacidade é importante para nós...</p>', 1),
  ('contato', 'Contato',
   '<h1>Entre em Contato</h1><p>Email: contato@jornaldemo.com</p>', 1);

-- ============================================================================
-- 9. Menus
-- ============================================================================

INSERT OR IGNORE INTO menus (location, label, url, display_order, is_active) VALUES
  ('header', 'Home', '/', 1, 1),
  ('header', 'Política', '/categoria/politica', 2, 1),
  ('header', 'Economia', '/categoria/economia', 3, 1),
  ('header', 'Brasil', '/categoria/brasil', 4, 1),
  ('header', 'Mundo', '/categoria/mundo', 5, 1),
  ('header', 'Esportes', '/categoria/esportes', 6, 1),
  ('header', 'Tecnologia', '/categoria/tecnologia', 7, 1),
  ('footer', 'Termos de Uso', '/p/termos', 1, 1),
  ('footer', 'Privacidade', '/p/privacidade', 2, 1),
  ('footer', 'Contato', '/p/contato', 3, 1),
  ('footer', 'Assinar', '/assinar', 4, 1);

-- ============================================================================
-- FIM DO SEED
-- ============================================================================
