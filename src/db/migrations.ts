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
}
