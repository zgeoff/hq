import type { Database } from 'bun:sqlite';
import { now } from '../../clock/now.ts';
import { HqError } from '../../errors.ts';
import type { JobRun } from '../../morning/types.ts';
import { FRESH_MIN } from '../fresh-min.ts';
import { goalsAge } from '../goals-age.ts';
import { stale } from '../stale.ts';
import { getMondayKey } from './get-monday-key.ts';
import { getRun } from './get-run.ts';
import { scheduleWeekly } from './schedule-weekly.ts';

// hq goals weekly: send this week's review now (any day), once per Monday.
export function sendWeekly(db: Database, actor: string, at: Date = now()): JobRun {
  const key = getMondayKey(at);
  return db
    .transaction(() => {
      const prev = getRun(db, key);
      if (prev) throw new HqError('exists', `the week of ${key} already ran (${prev.result} at ${prev.at})`);
      if (stale(db, at)) {
        const age = goalsAge(db, at);
        throw new HqError('stale', `${age === null ? 'goals data has no sync without errors yet' : `goals data is ${age} min old`} (limit ${FRESH_MIN} min): run hq goals sync first`);
      }
      return scheduleWeekly(db, { actor, at, key, detail: 'manual' });
    })
    .immediate();
}
