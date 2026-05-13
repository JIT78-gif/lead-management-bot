export const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  phone           TEXT PRIMARY KEY,
  whatsapp_name   TEXT,
  state           TEXT NOT NULL,
  collected       TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  phone            TEXT NOT NULL,
  direction        TEXT NOT NULL,
  text             TEXT NOT NULL,
  meta_message_id  TEXT UNIQUE,
  created_at       INTEGER NOT NULL,
  FOREIGN KEY (phone) REFERENCES conversations(phone)
);

CREATE TABLE IF NOT EXISTS leads (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  phone             TEXT UNIQUE NOT NULL,
  name              TEXT,
  industry          TEXT,
  team_size         TEXT,
  website_url       TEXT,
  social_handle     TEXT,
  status            TEXT NOT NULL DEFAULT 'new_qualified',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  FOREIGN KEY (phone) REFERENCES conversations(phone)
);

CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
`;
