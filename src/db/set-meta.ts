import type { Database } from 'bun:sqlite';

export function setMeta(db: Database, key: string, value: string | null): void {
  if (value === null) db.query('DELETE FROM meta WHERE key = ?').run(key);
  else db.query('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
}
