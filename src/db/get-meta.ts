import type { Database } from 'bun:sqlite';

export function getMeta(db: Database, key: string): string | null {
  const row = db.query('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | null;
  return row?.value ?? null;
}
