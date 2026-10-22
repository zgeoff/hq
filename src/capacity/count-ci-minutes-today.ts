import type { Database } from 'bun:sqlite';
import { row as goalRow } from '../goals/row.ts';
import { sydneyUtc } from '../morning/sydney-utc.ts';
import { sydney } from '../morning/sydney.ts';

// Today's CI minutes, as the goals numbers count them (src/goals/row.ts), for the Sydney day so far.
export function countCIMinutesToday(db: Database, at: Date): number {
  const s = sydney(at);
  const lo = sydneyUtc(s.y, s.mo, s.d).getTime();
  return goalRow(db, 'today', lo, sydneyUtc(s.y, s.mo, s.d + 1).getTime(), at, { events: [], from: null }).ci.minutes;
}
