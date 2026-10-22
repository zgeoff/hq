import type { Database } from 'bun:sqlite';
import type { OutageRow } from './types.ts';

// Every reader of outages means 'down' unless it asks for 'unready' (GEO-1142).
export function openOutage(db: Database): OutageRow | null {
  return db.query("SELECT * FROM outages WHERE ended_at IS NULL AND kind = 'down'").get() as OutageRow | null;
}
