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
}
