import type { Database } from 'bun:sqlite';
import type { NudgeRow } from './types.ts';

export function nudgeLog(db: Database, limit: number): NudgeRow[] {
  return db.query('SELECT id, at, slots, free_minutes, eligible, slots_after, checked_at FROM lanes_nudges ORDER BY id DESC LIMIT ?').all(limit) as NudgeRow[];
}
