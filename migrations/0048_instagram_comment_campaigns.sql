CREATE TABLE instagram_comment_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  media_id TEXT NOT NULL UNIQUE,
  post_permalink TEXT NOT NULL,
  name TEXT NOT NULL,
  keyword TEXT NOT NULL,
  card_title TEXT NOT NULL,
  card_text TEXT NOT NULL,
  button_text TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  image_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  enabled_at TEXT,
  link_token TEXT NOT NULL UNIQUE,
  opens INTEGER NOT NULL DEFAULT 0,
  poll_cursor TEXT,
  poll_at TEXT,
  poll_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE instagram_campaign_deliveries (
  comment_id TEXT PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES instagram_comment_campaigns(id),
  author_hash TEXT NOT NULL,
  commented_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','uncertain','skipped')),
  started_at TEXT,
  message_id TEXT,
  error TEXT,
  UNIQUE(campaign_id,author_hash)
);
CREATE INDEX instagram_campaign_delivery_queue ON instagram_campaign_deliveries(status,received_at);
CREATE INDEX instagram_comment_campaign_account ON instagram_comment_campaigns(account_id,enabled);
CREATE TRIGGER instagram_custom_campaign_exclusive_insert BEFORE INSERT ON instagram_comment_campaigns
 WHEN NEW.enabled=1 AND EXISTS(SELECT 1 FROM instagram_link_campaigns WHERE media_id=NEW.media_id AND enabled=1)
 BEGIN SELECT RAISE(ABORT,'Já existe uma resposta ativa para este post.'); END;
CREATE TRIGGER instagram_custom_campaign_exclusive_update BEFORE UPDATE OF enabled ON instagram_comment_campaigns
 WHEN NEW.enabled=1 AND EXISTS(SELECT 1 FROM instagram_link_campaigns WHERE media_id=NEW.media_id AND enabled=1)
 BEGIN SELECT RAISE(ABORT,'Já existe uma resposta ativa para este post.'); END;
CREATE TRIGGER instagram_article_campaign_exclusive_insert BEFORE INSERT ON instagram_link_campaigns
 WHEN NEW.enabled=1 AND EXISTS(SELECT 1 FROM instagram_comment_campaigns WHERE media_id=NEW.media_id AND enabled=1)
 BEGIN SELECT RAISE(ABORT,'Já existe uma campanha ativa para este post.'); END;
CREATE TRIGGER instagram_article_campaign_exclusive_update BEFORE UPDATE OF enabled ON instagram_link_campaigns
 WHEN NEW.enabled=1 AND EXISTS(SELECT 1 FROM instagram_comment_campaigns WHERE media_id=NEW.media_id AND enabled=1)
 BEGIN SELECT RAISE(ABORT,'Já existe uma campanha ativa para este post.'); END;
-- Negative references distinguish standalone campaigns from existing CMS publication IDs.
CREATE VIEW instagram_response_campaigns AS
 SELECT publication_id,account_id,media_id,enabled,enabled_at,article_url,link_token,opens,poll_cursor,poll_at,poll_error,updated_at,
 'article' kind,'LINK' keyword,NULL card_title,NULL card_text,NULL button_text,NULL image_url
 FROM instagram_link_campaigns
 UNION ALL
 SELECT -id,account_id,media_id,enabled,enabled_at,destination_url,link_token,opens,poll_cursor,poll_at,poll_error,updated_at,
 'custom',keyword,card_title,card_text,button_text,image_url FROM instagram_comment_campaigns;
CREATE VIEW instagram_response_deliveries AS
 SELECT comment_id,publication_id,author_hash,commented_at,received_at,source,status,started_at,message_id,error FROM instagram_link_replies
 UNION ALL
 SELECT comment_id,-campaign_id,author_hash,commented_at,received_at,source,status,started_at,message_id,error FROM instagram_campaign_deliveries;
