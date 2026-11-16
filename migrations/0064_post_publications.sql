CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  base_path TEXT NOT NULL DEFAULT '/',
  theme_key TEXT NOT NULL,
  UNIQUE (hostname, base_path)
);

INSERT INTO publications (id, name, hostname, theme_key) VALUES
  ('diario', 'Diário do Povo', 'diario.dopovo.com.br', 'diario'),
  ('do-povo', 'Do Povo', 'dopovo.com.br', 'do-povo');

ALTER TABLE posts ADD COLUMN publication_id TEXT NOT NULL DEFAULT 'diario' CHECK (publication_id IN ('diario', 'do-povo'));
CREATE INDEX idx_posts_publication_status ON posts(publication_id, status, published_at);

-- Public delivery for Do Povo requires scoped feeds, search, SEO and cache.
-- Keep Do Povo drafts out of all existing published/scheduled paths during rollout.
CREATE TRIGGER posts_publication_insert_guard BEFORE INSERT ON posts
WHEN NEW.publication_id = 'do-povo' AND
  (NEW.status = 'published' OR NEW.published_at IS NOT NULL OR NEW.scheduled_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'DO_POVO_PUBLICATION_NOT_ENABLED');
END;

CREATE TRIGGER posts_publication_update_guard BEFORE UPDATE ON posts
WHEN NEW.publication_id = 'do-povo' AND
  (NEW.status = 'published' OR NEW.published_at IS NOT NULL OR NEW.scheduled_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'DO_POVO_PUBLICATION_NOT_ENABLED');
END;

CREATE TRIGGER posts_publication_origin_guard BEFORE UPDATE OF publication_id ON posts
WHEN OLD.publication_id <> NEW.publication_id AND
  (OLD.status = 'published' OR OLD.published_at IS NOT NULL OR OLD.scheduled_at IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'POST_PUBLICATION_ORIGIN_LOCKED');
END;
