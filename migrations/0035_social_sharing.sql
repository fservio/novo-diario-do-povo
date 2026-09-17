-- Distribuição social profissional para matérias.
ALTER TABLE posts ADD COLUMN social_title TEXT;
ALTER TABLE posts ADD COLUMN social_description TEXT;
ALTER TABLE posts ADD COLUMN social_share_text TEXT;
ALTER TABLE posts ADD COLUMN social_image_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN social_image_position_x INTEGER NOT NULL DEFAULT 50
  CHECK (social_image_position_x BETWEEN 0 AND 100);
ALTER TABLE posts ADD COLUMN social_image_position_y INTEGER NOT NULL DEFAULT 50
  CHECK (social_image_position_y BETWEEN 0 AND 100);

CREATE INDEX idx_posts_social_image_media
  ON posts(social_image_media_id);
