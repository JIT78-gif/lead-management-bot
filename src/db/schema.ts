export const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  phone           TEXT PRIMARY KEY,
  whatsapp_name   TEXT,
  state           TEXT NOT NULL,
  collected       TEXT NOT NULL DEFAULT '{}',
  bot_paused      INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  phone               TEXT NOT NULL,
  direction           TEXT NOT NULL,
  text                TEXT NOT NULL,
  meta_message_id     TEXT UNIQUE,
  delivery_status     TEXT,
  delivery_error      TEXT,
  status_updated_at   INTEGER,
  sent_by             TEXT,         -- 'bot' or 'human' for outbound; NULL for inbound
  created_at          INTEGER NOT NULL,
  FOREIGN KEY (phone) REFERENCES conversations(phone)
);

CREATE TABLE IF NOT EXISTS leads (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  phone                    TEXT UNIQUE NOT NULL,
  name                     TEXT,
  industry                 TEXT,
  team_size                TEXT,
  website_url              TEXT,
  social_handle            TEXT,
  status                   TEXT NOT NULL DEFAULT 'new_qualified',
  notes                    TEXT,
  last_status_change_at    INTEGER,
  last_contact_at          INTEGER,
  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL,
  FOREIGN KEY (phone) REFERENCES conversations(phone)
);

CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
CREATE INDEX IF NOT EXISTS idx_messages_phone_created ON messages(phone, created_at);

CREATE TABLE IF NOT EXISTS calls (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  phone                TEXT NOT NULL,
  audio_path           TEXT NOT NULL,
  audio_size_bytes     INTEGER NOT NULL,
  duration_seconds     INTEGER,
  mime_type            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'processing',
  error                TEXT,
  transcript           TEXT,
  summary              TEXT,
  verdict              TEXT,
  verdict_confidence   REAL,
  verdict_reasoning    TEXT,
  key_points           TEXT,
  objections           TEXT,
  action_items         TEXT,
  created_at           INTEGER NOT NULL,
  analyzed_at          INTEGER,
  FOREIGN KEY (phone) REFERENCES leads(phone)
);

CREATE INDEX IF NOT EXISTS idx_calls_phone   ON calls(phone);
CREATE INDEX IF NOT EXISTS idx_calls_verdict ON calls(verdict);

-- Phase 5: cache for AI artifacts (coaching, pre-call brief, weekly digest,
-- win-pattern). One row per (kind, ref_key). expires_at NULL = never expires.
CREATE TABLE IF NOT EXISTS ai_artifacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  ref_key     TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER,
  UNIQUE(kind, ref_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_artifacts_kind ON ai_artifacts(kind);
`;
