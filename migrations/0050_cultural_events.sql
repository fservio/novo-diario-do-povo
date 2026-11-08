CREATE TABLE IF NOT EXISTS cultural_events (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  city_key TEXT NOT NULL,
  venue TEXT NOT NULL,
  address TEXT,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  timezone TEXT NOT NULL,
  price_type TEXT NOT NULL,
  price_text TEXT,
  source_url TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  image_key TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled')),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cultural_events_active ON cultural_events(status,ends_on,starts_on);
CREATE INDEX IF NOT EXISTS cultural_events_city ON cultural_events(state,city_key,starts_on);
