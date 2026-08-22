-- Story 9:16 linked to the existing Instagram editorial publication.

CREATE TABLE IF NOT EXISTS instagram_story_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id INTEGER NOT NULL UNIQUE,
  format TEXT NOT NULL DEFAULT 'story_9x16',
  template TEXT NOT NULL DEFAULT 'editorial_story',
  hat TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  photo_credit TEXT,
  cta_text TEXT NOT NULL DEFAULT 'Leia a matéria completa',
  image_position_x INTEGER NOT NULL DEFAULT 50,
  image_position_y INTEGER NOT NULL DEFAULT 50,
  render_token TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_id) REFERENCES instagram_publications(id) ON DELETE CASCADE,
  CHECK (format = 'story_9x16'),
  CHECK (image_position_x BETWEEN 0 AND 100),
  CHECK (image_position_y BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_instagram_story_publication
  ON instagram_story_variants(publication_id);

CREATE INDEX IF NOT EXISTS idx_instagram_story_token
  ON instagram_story_variants(render_token);

INSERT OR IGNORE INTO instagram_story_variants (
  publication_id, hat, title, subtitle, photo_credit,
  image_position_x, image_position_y, render_token, created_at, updated_at
)
SELECT
  id, hat, title, subtitle, photo_credit,
  image_position_x, image_position_y, lower(hex(randomblob(24))), created_at, updated_at
FROM instagram_publications;
