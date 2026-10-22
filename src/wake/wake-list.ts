import type { Database } from 'bun:sqlite';
import type { WakeEntry } from './types.ts';

export function wakeList(db: Database): WakeEntry[] {
  return db.query('SELECT * FROM wake_list ORDER BY added_at, name').all() as WakeEntry[];
}
