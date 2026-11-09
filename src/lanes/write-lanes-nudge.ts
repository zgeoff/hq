import type { Database } from 'bun:sqlite';
import type { LanesNudgeInput } from './types.ts';

export function writeLanesNudge(db: Database, nudge: LanesNudgeInput): number {
  return Number(db.query('INSERT INTO lanes_nudges (at, slots, free_minutes, eligible, event_seq, detail) VALUES (?, ?, ?, ?, ?, ?)').run(nudge.at, nudge.slots, nudge.freeMinutes, nudge.eligible, nudge.eventSeq, nudge.detail).lastInsertRowid);
}
