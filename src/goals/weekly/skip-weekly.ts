import type { Database } from 'bun:sqlite';
import { logEvent } from '../../log-event.ts';
import { iso } from '../../clock/iso.ts';
import { now } from '../../clock/now.ts';
import { HqError } from '../../errors.ts';
import type { JobRun } from '../../morning/types.ts';
import { getRun } from './get-run.ts';
import { JOB } from './job.ts';

// A review done another way: the job leaves that Monday alone.
export function skipWeekly(db: Database, date: string, reason: string, actor: string): JobRun {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) throw new HqError('bad_args', 'the date must be a Sydney Monday, such as 2026-10-19');
  if (new Date(parsed).getUTCDay() !== 1) throw new HqError('bad_args', `${date} is not a Monday`);
  if (!reason.trim()) throw new HqError('bad_args', '--reason is required');
  return db
    .transaction(() => {
      const prev = getRun(db, date);
      if (prev) throw new HqError('exists', `${date} already ran (${prev.result} at ${prev.at})`);
      db.query('INSERT INTO job_runs (job, key, at, result, detail, outbox_key) VALUES (?, ?, ?, ?, ?, NULL)').run(JOB, date, iso(now()), 'skipped', reason.trim());
      logEvent(db, 'hq', `job:${JOB}`, 'skipped', actor, null, null, { key: date, reason });
      return getRun(db, date)!;
    })
    .immediate();
}
