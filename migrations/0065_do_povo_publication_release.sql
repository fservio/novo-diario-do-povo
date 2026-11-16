-- Explicit release for individual editorial tests. Empty by default in every database.
CREATE TABLE do_povo_publication_releases (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL CHECK (julianday(expires_at) IS NOT NULL)
);

-- The insert and origin guards remain active. A release only applies to an
-- existing Do Povo draft and cannot be used to schedule or move a publication.
CREATE TRIGGER posts_publication_update_release_guard BEFORE UPDATE ON posts
WHEN NEW.publication_id = 'do-povo' AND (
  NEW.scheduled_at IS NOT NULL OR (
    (NEW.status = 'published' OR NEW.published_at IS NOT NULL) AND
    NOT (OLD.publication_id = 'do-povo' AND OLD.published_at IS NOT NULL
      AND (OLD.status = 'published' OR NEW.status <> 'published')
      AND NEW.published_at IS OLD.published_at) AND
    NOT EXISTS (
      SELECT 1 FROM do_povo_publication_releases
      WHERE post_id = OLD.id AND OLD.publication_id = 'do-povo' AND OLD.status IN ('draft', 'review')
        AND NEW.status = 'published' AND NEW.published_at IS NOT NULL
        AND julianday(expires_at) > julianday('now')
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'DO_POVO_PUBLICATION_NOT_ENABLED');
END;

DROP TRIGGER posts_publication_update_guard;
