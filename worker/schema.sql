-- دفتر یادداشت هوشمند — schema دیتابیس D1

CREATE TABLE IF NOT EXISTS sites (
  id          TEXT PRIMARY KEY,
  url         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'عمومی',
  tags        TEXT NOT NULL DEFAULT '[]',
  favicon     TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  highlights  TEXT NOT NULL DEFAULT '[]',
  sentiment   TEXT NOT NULL DEFAULT 'اطلاع‌رسانی',
  key_topics  TEXT NOT NULL DEFAULT '[]',
  read_time   TEXT NOT NULL DEFAULT '۳ دقیقه',
  provider    TEXT NOT NULL DEFAULT 'pending',
  stale       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sites_url ON sites(url);
CREATE INDEX IF NOT EXISTS idx_sites_category ON sites(category);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('provider', 'g4f'),
  ('g4f_models', '["gpt-4"]'),
  ('google_model', 'gemini-1.5-flash'),
  ('openrouter_model', 'google/gemini-2.0-flash-exp:free'),
  ('summary_max_chars', '180');

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES
  ('last_updated', ''),
  ('total_sites', '0');
