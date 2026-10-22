import type { Database } from 'bun:sqlite';
import { now } from '../../clock/now.ts';
import { sydney } from '../../morning/sydney.ts';
import type { JobRun } from '../../morning/types.ts';
import { goalsAge } from '../goals-age.ts';
import { isPast } from '../is-past.ts';
import { stale } from '../stale.ts';
import { getMondayKey } from './get-monday-key.ts';
import { getRun } from './get-run.ts';
import { scheduleWeekly } from './schedule-weekly.ts';

// hq health flags a Monday with no run after LATE.
const DUE = { h: 17, m: 0 },
  LATE = { h: 17, m: 30 };

// The watcher's step: once per Monday, from 17:00, and only on goals data synced within FRESH_MIN
// minutes; with older data it waits for the next tick (the goals step runs first).
export function goalsWeeklyTick(db: Database, actor: string, at: Date = now()): { run: JobRun | null; waiting: string | null } {
  const s = sydney(at);
  if (getMondayKey(at) !== s.date || !isPast(s, DUE)) {
    return { run: null, waiting: null };
  }
  return db
    .transaction(() => {
      if (getRun(db, s.date)) return { run: null, waiting: null };
      if (stale(db, at)) {
        const age = goalsAge(db, at);
        return { run: null, waiting: `goals data ${age === null ? 'never synced' : `${age} min old`}` };
      }
      const detail = isPast(s, LATE) ? 'late' : null;
      return { run: scheduleWeekly(db, { actor, at, key: s.date, detail }), waiting: null };
    })
    .immediate();
}
