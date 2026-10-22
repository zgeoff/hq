import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import type { OutageRow } from './types.ts';

// Unready episodes overlapping the window: Nix live but not ready. They are never downtime.
export function unreadyIn(db: Database, from: Date, to: Date): OutageRow[] {
  return db.query("SELECT * FROM outages WHERE kind = 'unready' AND started_at < ? AND (ended_at IS NULL OR ended_at > ?) ORDER BY started_at").all(iso(to), iso(from)) as OutageRow[];
}
