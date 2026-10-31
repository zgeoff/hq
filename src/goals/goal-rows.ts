import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { sydneyUtc } from '../morning/sydney-utc.ts';
import { sydney } from '../morning/sydney.ts';
import { readLog } from './read-log.ts';
import { buildNodeLogFiles } from './build-node-log-files.ts';
import { stateDir } from '../state/state-dir.ts';
import { row } from './row.ts';
import type { GoalRow } from './types.ts';

export function goalRows(db: Database, days: number, at: Date = now()): { weeks: GoalRow[]; days: GoalRow[] } {
  const log = readLog(stateDir(), buildNodeLogFiles());
  const s = sydney(at);
  const fmt = (t: number) => new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(t)).replace(',', '');
  const dayRows: GoalRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const lo = sydneyUtc(s.y, s.mo, s.d - i).getTime();
    const hi = sydneyUtc(s.y, s.mo, s.d - i + 1).getTime();
    dayRows.push(row(db, fmt(lo), lo, hi, at, log));
  }
  const dow = (new Date(Date.UTC(s.y, s.mo - 1, s.d)).getUTCDay() + 6) % 7; // 0 = Monday
  const weekRows: GoalRow[] = [];
  for (const k of [1, 0]) {
    const lo = sydneyUtc(s.y, s.mo, s.d - dow - 7 * k).getTime();
    const hi = sydneyUtc(s.y, s.mo, s.d - dow - 7 * k + 7).getTime();
    weekRows.push(row(db, `week of ${fmt(lo).replace(/^\w+ /, '')}`, lo, hi, at, log));
  }
  return { weeks: weekRows, days: dayRows };
}
