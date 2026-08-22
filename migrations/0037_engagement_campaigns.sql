-- Campanhas de engajamento: pop-ups, banners e chamadas editoriais controladas

CREATE TABLE IF NOT EXISTS engagement_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  internal_name TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('newsletter', 'editorial', 'instagram', 'advertising')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'archived')),
  display_format TEXT NOT NULL DEFAULT 'slide_in' CHECK (display_format IN ('banner', 'slide_in', 'modal')),
  eyebrow TEXT,
  title TEXT NOT NULL,
  body TEXT,
  cta_label TEXT,
  cta_url TEXT,
  image_media_id INTEGER,
  post_id INTEGER,
  advertiser_name TEXT,
  page_scope TEXT NOT NULL DEFAULT 'all' CHECK (page_scope IN ('all', 'home', 'articles', 'listings', 'specific')),
  include_paths_json TEXT NOT NULL DEFAULT '[]',
  exclude_paths_json TEXT NOT NULL DEFAULT '[]',
  devices TEXT NOT NULL DEFAULT 'all' CHECK (devices IN ('all', 'desktop', 'mobile')),
  trigger_type TEXT NOT NULL DEFAULT 'delay' CHECK (trigger_type IN ('delay', 'scroll', 'pageviews', 'exit_intent')),
  trigger_value INTEGER NOT NULL DEFAULT 12,
  min_pageviews INTEGER NOT NULL DEFAULT 2,
  cooldown_hours INTEGER NOT NULL DEFAULT 168,
  click_cooldown_hours INTEGER NOT NULL DEFAULT 336,
  max_per_session INTEGER NOT NULL DEFAULT 1,
  max_impressions_30d INTEGER NOT NULL DEFAULT 2,
  priority INTEGER NOT NULL DEFAULT 50,
  starts_at DATETIME,
  ends_at DATETIME,
  created_by_user_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME,
  archived_at DATETIME,
  FOREIGN KEY (image_media_id) REFERENCES media(id) ON DELETE SET NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_engagement_campaigns_delivery
  ON engagement_campaigns(status, starts_at, ends_at, priority);

CREATE INDEX IF NOT EXISTS idx_engagement_campaigns_type
  ON engagement_campaigns(campaign_type, status);

CREATE TABLE IF NOT EXISTS engagement_campaign_events (
  campaign_id INTEGER NOT NULL,
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'close', 'click', 'conversion')),
  device TEXT NOT NULL CHECK (device IN ('desktop', 'mobile')),
  page_type TEXT NOT NULL DEFAULT 'other',
  total INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, event_date, event_type, device, page_type),
  FOREIGN KEY (campaign_id) REFERENCES engagement_campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_engagement_events_campaign
  ON engagement_campaign_events(campaign_id, event_date);

-- Single opt-in: o consentimento ativa a inscrição imediatamente.
ALTER TABLE newsletter_subscribers ADD COLUMN consent_at DATETIME;
ALTER TABLE newsletter_subscribers ADD COLUMN consent_version TEXT;

