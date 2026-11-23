-- One cursor per pilot. Start with one day of material and advance only with the batch.
CREATE TABLE special_discovery_cursor (
  pilot TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL,
  post_id INTEGER NOT NULL
);
INSERT INTO special_discovery_cursor VALUES ('repasses', unixepoch()-86400, 0);

CREATE INDEX idx_special_discovery_posts
ON posts(max(coalesce(unixepoch(updated_at),0),unixepoch(published_at)), id)
WHERE publication_id='diario' AND status='published' AND seo_noindex=0;

CREATE TABLE special_story_queue (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  revision_at INTEGER NOT NULL,
  question TEXT NOT NULL,
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
  state TEXT NOT NULL CHECK(state IN ('aguarda_apuracao','retirada')),
  recorded_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TABLE special_story_history (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL,
  revision_at INTEGER NOT NULL,
  question TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  state TEXT NOT NULL,
  recorded_at INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE TRIGGER special_story_opened AFTER INSERT ON special_story_queue BEGIN
  INSERT INTO special_story_history(post_id,revision_at,question,evidence_json,state)
  VALUES(NEW.post_id,NEW.revision_at,NEW.question,NEW.evidence_json,NEW.state);
END;
CREATE TRIGGER special_story_changed AFTER UPDATE ON special_story_queue BEGIN
  INSERT INTO special_story_history(post_id,revision_at,question,evidence_json,state)
  VALUES(NEW.post_id,NEW.revision_at,NEW.question,NEW.evidence_json,NEW.state);
END;
