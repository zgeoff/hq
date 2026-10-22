import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import type { OutageRow } from './types.ts';

export function outagesIn(db: Database, from: Date, to: Date): OutageRow[] {
  return db.query("SELECT * FROM outages WHERE kind = 'down' AND started_at < ? AND (ended_at IS NULL OR ended_at > ?) ORDER BY started_at").all(iso(to), iso(from)) as OutageRow[];
}
