import type Database from 'better-sqlite3';

interface ColumnInfo {
  name: string;
}

function tableColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  return new Set(rows.map((r) => r.name));
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  ddl: string
): void {
  const cols = tableColumns(db, table);
  if (!cols.has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/**
 * Idempotent migrations applied on every boot AFTER the canonical schema runs.
 * Fresh installs already have the new columns from schema.ts; this only fires
 * for existing databases that were created before Phase 2.
 */
export function runMigrations(db: Database.Database): void {
  addColumnIfMissing(db, 'leads', 'notes', 'TEXT');
  addColumnIfMissing(db, 'leads', 'last_status_change_at', 'INTEGER');

  // Phase 5
  addColumnIfMissing(db, 'leads', 'last_contact_at', 'INTEGER');

  // Backfill last_contact_at for existing leads so the daily-reminder query
  // doesn't treat the entire backlog as "never contacted". Use updated_at as
  // a reasonable proxy for the most-recent activity on the lead row.
  db.exec(
    `UPDATE leads SET last_contact_at = updated_at WHERE last_contact_at IS NULL`
  );

  // Phase 6 — delivery status from Meta status webhooks.
  addColumnIfMissing(db, 'messages', 'delivery_status', 'TEXT');
  addColumnIfMissing(db, 'messages', 'delivery_error', 'TEXT');
  addColumnIfMissing(db, 'messages', 'status_updated_at', 'INTEGER');
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_messages_phone_created ON messages(phone, created_at)`
  );

  // Phase 6.5 — manual takeover + per-conversation notes + sender attribution.
  addColumnIfMissing(db, 'conversations', 'bot_paused', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'conversations', 'notes', 'TEXT');
  addColumnIfMissing(db, 'messages', 'sent_by', 'TEXT');

  // Phase 7 — country + niche routing for international expansion.
  addColumnIfMissing(db, 'conversations', 'country_code',        'TEXT');
  addColumnIfMissing(db, 'conversations', 'niche',               'TEXT');
  addColumnIfMissing(db, 'conversations', 'niche_detail',        'TEXT');
  addColumnIfMissing(db, 'conversations', 'meet_preferred_time', 'TEXT');
  addColumnIfMissing(db, 'leads',         'country_code',        'TEXT');
  addColumnIfMissing(db, 'leads',         'niche',               'TEXT');
  addColumnIfMissing(db, 'leads',         'niche_detail',        'TEXT');
  addColumnIfMissing(db, 'leads',         'meet_preferred_time', 'TEXT');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_country ON leads(country_code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_niche   ON leads(niche)`);

  // Phase 8 — Google Calendar OAuth + auto-Meet booking.
  // The google_oauth table is created by the canonical schema on
  // fresh installs; no ALTER needed since it's a new table.
  addColumnIfMissing(db, 'conversations', 'meet_status',       'TEXT');
  addColumnIfMissing(db, 'conversations', 'meet_proposed_iso', 'TEXT');
  addColumnIfMissing(db, 'conversations', 'meet_event_id',     'TEXT');
  addColumnIfMissing(db, 'conversations', 'meet_link',         'TEXT');
  addColumnIfMissing(db, 'conversations', 'customer_email',    'TEXT');
  addColumnIfMissing(db, 'leads', 'meet_event_id',  'TEXT');
  addColumnIfMissing(db, 'leads', 'meet_link',      'TEXT');
  addColumnIfMissing(db, 'leads', 'customer_email', 'TEXT');

  // The google_oauth table on an EXISTING db: create it if missing
  // (PRAGMA table_info returns nothing for non-existent tables, and
  // our addColumnIfMissing helper assumes the table exists). Use raw
  // CREATE TABLE IF NOT EXISTS.
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_oauth (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      account_email   TEXT NOT NULL,
      refresh_token   TEXT NOT NULL,
      access_token    TEXT,
      access_expires  INTEGER,
      connected_at    INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )
  `);
}
