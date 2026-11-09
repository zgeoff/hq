import type { Database } from 'bun:sqlite';
import type { OutageInput } from './types.ts';

export function writeOutage(db: Database, outage: OutageInput): number {
  return Number(db.query('INSERT INTO outages (started_at, detected_at, kind) VALUES (?, ?, ?)').run(outage.startedAt, outage.detectedAt, outage.kind).lastInsertRowid);
}
