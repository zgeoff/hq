import type { Database } from 'bun:sqlite';
import { now } from '../../clock/now.ts';
import { HqError } from '../../errors.ts';
import { sydney } from '../../morning/sydney.ts';
import type { JobRun } from '../../morning/types.ts';
import { FRESH_MIN } from '../fresh-min.ts';
import { goalsAge } from '../goals-age.ts';
import { stale } from '../stale.ts';
import { getRun } from './get-run.ts';
import { scheduleDaily } from './schedule-daily.ts';

// hq goals daily: send today's check-in now (any time of day), once per day.
export function sendDaily(db: Database, actor: string, at: Date = now()): JobRun {
  const s = sydney(at);
  return db
    .transaction(() => {
      const prev = getRun(db, s.date);
      if (prev) throw new HqError('exists', `${s.date} already ran (${prev.result} at ${prev.at})`);
      if (stale(db, at)) {
        const age = goalsAge(db, at);
        throw new HqError('stale', `${age === null ? 'goals data has no sync without errors yet' : `goals data is ${age} min old`} (limit ${FRESH_MIN} min): run hq goals sync first`);
      }
      return scheduleDaily(db, { actor, at, key: s.date, detail: 'manual' });
    })
    .immediate();
}
