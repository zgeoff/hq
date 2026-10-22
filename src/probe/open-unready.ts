import type { Database } from 'bun:sqlite';
import type { OutageRow } from './types.ts';

export function openUnready(db: Database): OutageRow | null {
  return db.query("SELECT * FROM outages WHERE ended_at IS NULL AND kind = 'unready'").get() as OutageRow | null;
}
