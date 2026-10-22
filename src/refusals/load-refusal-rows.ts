import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import type { RefusalRow } from './types.ts';

export function loadRefusalRows(db: Database, from: Date, to: Date = now()): RefusalRow[] {
  return db.query('SELECT uuid, at, claude_session, transcript, subagent, cwd, atc_session, atc_name, issue, tool, input, reason FROM refusals WHERE at >= ? AND at < ? ORDER BY at DESC, uuid').all(iso(from), iso(to)) as RefusalRow[];
}
