-- Newsletter editorial workflow and delivery ledger

ALTER TABLE newsletter_subscribers ADD COLUMN unsubscribe_token TEXT;
ALTER TABLE newsletter_subscribers ADD COLUMN updated_at DATETIME;
ALTER TABLE newsletter_subscribers ADD COLUMN last_sent_at DATETIME;

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token
  ON newsletter_subscribers(unsubscribe_token);

ALTER TABLE newsletter_campaigns ADD COLUMN preheader TEXT;
ALTER TABLE newsletter_campaigns ADD COLUMN intro_text TEXT;
ALTER TABLE newsletter_campaigns ADD COLUMN recipient_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE newsletter_campaigns ADD COLUMN failed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE newsletter_campaigns ADD COLUMN updated_at DATETIME;

CREATE TABLE IF NOT EXISTS newsletter_campaign_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE RESTRICT,
  UNIQUE(campaign_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_campaign_items_campaign
  ON newsletter_campaign_items(campaign_id, position);

CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  subscriber_id INTEGER,
  recipient_email TEXT NOT NULL,
  delivery_type TEXT NOT NULL DEFAULT 'campaign', -- campaign, test
  status TEXT NOT NULL DEFAULT 'queued', -- queued, sent, failed
  provider_message_id TEXT,
  error_message TEXT,
  attempted_at DATETIME,
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES newsletter_subscribers(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_delivery_once
  ON newsletter_deliveries(campaign_id, subscriber_id, delivery_type)
  WHERE subscriber_id IS NOT NULL AND delivery_type = 'campaign';

CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_recent
  ON newsletter_deliveries(status, sent_at);

CREATE INDEX IF NOT EXISTS idx_newsletter_deliveries_campaign
  ON newsletter_deliveries(campaign_id, status);
