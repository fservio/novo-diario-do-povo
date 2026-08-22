-- WhatsApp: aquisição consentida, destinos editoriais, campanhas e auditoria.

CREATE TABLE IF NOT EXISTS whatsapp_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  preferences_json TEXT NOT NULL DEFAULT '[]',
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('breaking', 'daily', 'twice_daily')),
  source TEXT NOT NULL DEFAULT 'landing',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  consent_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'activated', 'expired')),
  contact_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  activated_at DATETIME,
  FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_leads_status ON whatsapp_leads(status, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL UNIQUE,
  phone_e164 TEXT NOT NULL UNIQUE,
  profile_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'unsubscribed', 'blocked')),
  preferences_json TEXT NOT NULL DEFAULT '[]',
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('breaking', 'daily', 'twice_daily')),
  source TEXT NOT NULL DEFAULT 'whatsapp',
  consent_at DATETIME NOT NULL,
  consent_version TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  last_inbound_at DATETIME,
  last_outbound_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_status ON whatsapp_contacts(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_consent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('opt_in', 'preferences', 'pause', 'resume', 'opt_out', 'block')),
  source TEXT NOT NULL,
  consent_version TEXT,
  metadata_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_consent_contact ON whatsapp_consent_events(contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('group', 'community', 'channel')),
  scope TEXT,
  description TEXT,
  invite_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'full', 'archived')),
  priority INTEGER NOT NULL DEFAULT 100,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_by_user_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_destinations_active ON whatsapp_destinations(status, priority, id);

CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('digest', 'breaking', 'editorial', 'subscriber', 'sponsored')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sending', 'sent', 'failed', 'archived')),
  segment_json TEXT NOT NULL DEFAULT '{}',
  message_title TEXT NOT NULL,
  message_body TEXT NOT NULL,
  target_url TEXT NOT NULL,
  template_name TEXT,
  template_language TEXT NOT NULL DEFAULT 'pt_BR',
  post_id INTEGER,
  scheduled_at DATETIME,
  sent_at DATETIME,
  created_by_user_id INTEGER,
  approved_by_user_id INTEGER,
  approved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_status ON whatsapp_campaigns(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  message_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  sent_at DATETIME,
  delivered_at DATETIME,
  read_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, contact_id),
  FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES whatsapp_contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_deliveries_campaign ON whatsapp_deliveries(campaign_id, status);
