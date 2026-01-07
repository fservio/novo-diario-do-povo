-- ============================================================================
-- Migration: 0001_initial_schema.sql
-- Descrição: Schema completo do jornal (editorial, mídia, ads, paywall, asaas)
-- ============================================================================

-- ============================================================================
-- 1. Core: Users & Auth
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor', -- admin, editor
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================================
-- 2. Editorial: Authors
-- ============================================================================

CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  bio TEXT,
  avatar_media_id INTEGER,
  email TEXT,
  social_twitter TEXT,
  social_instagram TEXT,
  social_linkedin TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_authors_slug ON authors(slug);

-- ============================================================================
-- 3. Editorial: Categories
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_id INTEGER,
  seo_title TEXT,
  seo_description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- ============================================================================
-- 4. Editorial: Tags
-- ============================================================================

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  seo_noindex INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tags_slug ON tags(slug);

-- ============================================================================
-- 5. Editorial: Posts
-- ============================================================================

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  cover_media_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, review, published, archived
  template TEXT NOT NULL DEFAULT 'article', -- article, liveblog, hub, story
  
  -- SEO
  seo_title TEXT,
  seo_description TEXT,
  seo_canonical TEXT,
  seo_noindex INTEGER NOT NULL DEFAULT 0,
  
  -- Paywall
  is_premium INTEGER NOT NULL DEFAULT 0,
  paywall_tier TEXT, -- hard, metered, free
  metering_exempt INTEGER NOT NULL DEFAULT 0,
  
  -- Breaking news (free temporariamente)
  breaking_until DATETIME,
  
  -- Timestamps
  published_at DATETIME,
  scheduled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE RESTRICT,
  FOREIGN KEY (cover_media_id) REFERENCES media(id) ON DELETE SET NULL
);

CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_category ON posts(category_id);
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_published ON posts(published_at);
CREATE INDEX idx_posts_premium ON posts(is_premium);

-- ============================================================================
-- 6. Editorial: Post Revisions
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  changed_by_user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_revisions_post ON post_revisions(post_id);

-- ============================================================================
-- 7. Editorial: Post Tags (many-to-many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_post_tags_post ON post_tags(post_id);
CREATE INDEX idx_post_tags_tag ON post_tags(tag_id);

-- ============================================================================
-- 8. Editorial: Pages (estáticas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  seo_title TEXT,
  seo_description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pages_slug ON pages(slug);

-- ============================================================================
-- 9. Editorial: Menus
-- ============================================================================

CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  location TEXT NOT NULL, -- header, footer, sidebar
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  parent_id INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (parent_id) REFERENCES menus(id) ON DELETE CASCADE
);

CREATE INDEX idx_menus_location ON menus(location);
CREATE INDEX idx_menus_parent ON menus(parent_id);

-- ============================================================================
-- 10. Editorial: Redirects (301/302)
-- ============================================================================

CREATE TABLE IF NOT EXISTS redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_path TEXT UNIQUE NOT NULL,
  to_path TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_redirects_from ON redirects(from_path);

-- ============================================================================
-- 11. Settings (public/private configs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL, -- JSON armazena qualquer tipo
  scope TEXT NOT NULL DEFAULT 'public', -- public, private
  version INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_settings_scope ON settings(scope);

-- ============================================================================
-- 12. Audit Log (segurança e auditabilidade)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL, -- post, setting, subscription, etc
  entity_id TEXT, -- pode ser string ou int
  action TEXT NOT NULL, -- create, update, delete, activate, cancel
  actor_type TEXT NOT NULL, -- user, system, webhook
  actor_id TEXT, -- user_id, 'n8n', 'asaas'
  details_json TEXT, -- payload ou diff
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_log(actor_type, actor_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ============================================================================
-- 13. Mídia: Media (R2 keys + metadados)
-- ============================================================================

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT UNIQUE NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt TEXT,
  credits TEXT,
  
  -- Variantes responsivas (JSON array de objetos {width, r2_key})
  variants_json TEXT,
  
  -- Placeholder blur (base64 ou blurhash)
  placeholder TEXT,
  
  uploaded_by_user_id INTEGER,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_media_r2_key ON media(r2_key);
CREATE INDEX idx_media_uploaded ON media(uploaded_at);

-- ============================================================================
-- 14. Ads: Ad Slots (configuração por template)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ads_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_id TEXT UNIQUE NOT NULL, -- ex: home_top_leaderboard
  template TEXT NOT NULL, -- home, article, listing, live, story
  position TEXT NOT NULL, -- top, infeed_1, sidebar_1, footer, sticky_mobile
  
  -- Tamanhos por breakpoint (JSON: {desktop: [[970,250]], mobile: [[320,100]]})
  sizes_json TEXT NOT NULL,
  
  -- Lazy load
  lazy INTEGER NOT NULL DEFAULT 1,
  
  -- Anti-CLS placeholder
  placeholder_enabled INTEGER NOT NULL DEFAULT 1,
  placeholder_aspect_ratio TEXT, -- ex: "16/9" ou null
  
  -- Targeting (JSON object)
  targeting_json TEXT,
  
  -- Subscriber override
  hide_for_subscribers INTEGER NOT NULL DEFAULT 0,
  
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ads_template ON ads_slots(template);
CREATE INDEX idx_ads_active ON ads_slots(is_active);

-- ============================================================================
-- 15. Webhooks: Events (idempotência n8n/asaas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL, -- n8n, asaas, stripe
  event_id TEXT NOT NULL, -- ID único do webhook
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processed, failed
  processed_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, event_id)
);

CREATE INDEX idx_webhook_provider ON webhook_events(provider);
CREATE INDEX idx_webhook_status ON webhook_events(status);
CREATE INDEX idx_webhook_hash ON webhook_events(payload_hash);

-- ============================================================================
-- 16. Páginas Especiais: Liveblogs
-- ============================================================================

CREATE TABLE IF NOT EXISTS liveblogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER UNIQUE NOT NULL,
  is_live INTEGER NOT NULL DEFAULT 1,
  refresh_interval INTEGER DEFAULT 60, -- segundos
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS liveblog_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liveblog_id INTEGER NOT NULL,
  headline TEXT NOT NULL,
  content TEXT NOT NULL,
  entry_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (liveblog_id) REFERENCES liveblogs(id) ON DELETE CASCADE
);

CREATE INDEX idx_liveblog_entries_blog ON liveblog_entries(liveblog_id);
CREATE INDEX idx_liveblog_entries_time ON liveblog_entries(entry_time);

-- ============================================================================
-- 17. Páginas Especiais: Hubs Editoriais
-- ============================================================================

CREATE TABLE IF NOT EXISTS hubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER UNIQUE NOT NULL,
  layout TEXT NOT NULL DEFAULT 'default', -- default, grid, magazine
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hub_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_id INTEGER NOT NULL,
  block_type TEXT NOT NULL, -- featured, list, query
  block_config_json TEXT NOT NULL, -- config específica por tipo
  display_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (hub_id) REFERENCES hubs(id) ON DELETE CASCADE
);

CREATE INDEX idx_hub_blocks_hub ON hub_blocks(hub_id);

-- ============================================================================
-- 18. Páginas Especiais: Web Stories
-- ============================================================================

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  publisher_logo_media_id INTEGER,
  poster_portrait_media_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publisher_logo_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (poster_portrait_media_id) REFERENCES media(id) ON DELETE SET NULL
);

CREATE INDEX idx_stories_slug ON stories(slug);
CREATE INDEX idx_stories_published ON stories(published_at);

CREATE TABLE IF NOT EXISTS story_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  headline TEXT NOT NULL,
  layer_text TEXT,
  cta_text TEXT,
  cta_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE RESTRICT
);

CREATE INDEX idx_story_pages_story ON story_pages(story_id);

-- ============================================================================
-- 19. Paywall: Reader Users (leitores/assinantes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reader_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT, -- se usar senha; pode ser NULL se magic link only
  is_verified INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT,
  reset_token TEXT,
  reset_expires_at DATETIME,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reader_users_email ON reader_users(email);

-- ============================================================================
-- 20. Paywall: Reader Sessions (se usar magic link/session)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reader_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reader_user_id) REFERENCES reader_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_reader_sessions_token ON reader_sessions(token);
CREATE INDEX idx_reader_sessions_expires ON reader_sessions(expires_at);

-- ============================================================================
-- 21. Paywall: Plans (gerenciados no CMS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  billing_cycle TEXT NOT NULL, -- monthly, yearly
  trial_days INTEGER NOT NULL DEFAULT 0,
  
  -- Benefícios (JSON array de strings)
  benefits_json TEXT,
  
  -- Integração Asaas
  asaas_external_ref TEXT,
  
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plans_slug ON plans(slug);
CREATE INDEX idx_plans_active ON plans(is_active);

-- ============================================================================
-- 22. Paywall: Entitlements (direitos de acesso)
-- ============================================================================

CREATE TABLE IF NOT EXISTS entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, suspended, canceled, expired
  current_period_start DATETIME,
  current_period_end DATETIME,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reader_user_id) REFERENCES reader_users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
);

CREATE INDEX idx_entitlements_reader ON entitlements(reader_user_id);
CREATE INDEX idx_entitlements_status ON entitlements(status);
CREATE INDEX idx_entitlements_period_end ON entitlements(current_period_end);

-- ============================================================================
-- 23. Paywall: Metering Counters (anônimo + logado)
-- ============================================================================

CREATE TABLE IF NOT EXISTS metering_counters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL, -- cookie hash ou reader_user_id
  identifier_type TEXT NOT NULL, -- anon, user
  month_year TEXT NOT NULL, -- ex: '2024-01'
  count INTEGER NOT NULL DEFAULT 0,
  last_incremented_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(identifier, identifier_type, month_year)
);

CREATE INDEX idx_metering_identifier ON metering_counters(identifier, identifier_type);
CREATE INDEX idx_metering_month ON metering_counters(month_year);

-- ============================================================================
-- 24. ASAAS: Customers (mapeamento reader → asaas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS asaas_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_user_id INTEGER UNIQUE NOT NULL,
  asaas_customer_id TEXT UNIQUE NOT NULL,
  asaas_environment TEXT NOT NULL, -- sandbox, production
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reader_user_id) REFERENCES reader_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_asaas_customers_reader ON asaas_customers(reader_user_id);
CREATE INDEX idx_asaas_customers_asaas_id ON asaas_customers(asaas_customer_id);

-- ============================================================================
-- 25. ASAAS: Subscriptions (assinaturas via Asaas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS asaas_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  asaas_subscription_id TEXT UNIQUE NOT NULL,
  asaas_customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, active, suspended, canceled
  current_period_end DATETIME,
  asaas_environment TEXT NOT NULL, -- sandbox, production
  
  -- Snapshot do plano no momento da criação
  price_cents INTEGER NOT NULL,
  billing_cycle TEXT NOT NULL,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (reader_user_id) REFERENCES reader_users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
);

CREATE INDEX idx_asaas_subs_reader ON asaas_subscriptions(reader_user_id);
CREATE INDEX idx_asaas_subs_asaas_id ON asaas_subscriptions(asaas_subscription_id);
CREATE INDEX idx_asaas_subs_status ON asaas_subscriptions(status);

-- ============================================================================
-- 26. Newsletter: Subscribers
-- ============================================================================

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  segments_json TEXT, -- ex: ["geral", "premium"]
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, unsubscribed
  confirmation_token TEXT,
  confirmed_at DATETIME,
  unsubscribed_at DATETIME,
  source TEXT, -- widget, admin, import
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX idx_newsletter_status ON newsletter_subscribers(status);

-- ============================================================================
-- 27. Newsletter: Campaigns (opcional, interno)
-- ============================================================================

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  content_html TEXT NOT NULL,
  segments_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, sending, sent
  sent_count INTEGER NOT NULL DEFAULT 0,
  scheduled_at DATETIME,
  sent_at DATETIME,
  created_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- 28. Push: Subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  
  -- Segmentação (JSON array)
  segments_json TEXT,
  
  reader_user_id INTEGER, -- opcional, se o leitor estiver logado
  status TEXT NOT NULL DEFAULT 'active', -- active, unsubscribed
  
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (reader_user_id) REFERENCES reader_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_push_endpoint ON push_subscriptions(endpoint);
CREATE INDEX idx_push_reader ON push_subscriptions(reader_user_id);
CREATE INDEX idx_push_status ON push_subscriptions(status);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
