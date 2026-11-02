import type { Database } from 'bun:sqlite';
import { now } from '../../clock/now.ts';
import { sydney } from '../../morning/sydney.ts';
import type { JobRun } from '../../morning/types.ts';
import { goalsAge } from '../goals-age.ts';
import { isPast } from '../is-past.ts';
import { stale } from '../stale.ts';
import { getRun } from './get-run.ts';
import { scheduleDaily } from './schedule-daily.ts';

const DUE = { h: 18, m: 0 },
  LATE = { h: 18, m: 30 };

export function goalsDailyTick(db: Database, actor: string, at: Date = now()): { run: JobRun | null; waiting: string | null } {
  const s = sydney(at);
  if (!isPast(s, DUE)) {
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
      return { run: scheduleDaily(db, { actor, at, key: s.date, detail }), waiting: null };
    })
    .immediate();
}
