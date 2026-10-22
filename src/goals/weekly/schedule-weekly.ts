import type { Database } from 'bun:sqlite';
import { logEvent } from '../../log-event.ts';
import { owner } from '../../owner.ts';
import { iso } from '../../clock/iso.ts';
import type { JobRun } from '../../morning/types.ts';
import { enqueue } from '../../outbox/enqueue.ts';
import { getRun } from './get-run.ts';
import { JOB } from './job.ts';
import { weeklyText } from './weekly-text.ts';

interface RunRequest {
  actor: string;
  at: Date;
  key: string;
  detail: string | null;
}

export function scheduleWeekly(db: Database, run: RunRequest): JobRun {
  const actor = run.actor,
    at = run.at,
    detail = run.detail,
    key = run.key;
  const text = weeklyText(db, at); // before the run row: the flags are those since the previous weekly
  const seq = logEvent(db, 'hq', `job:${JOB}`, 'ran', actor, null, null, { key, detail });
  enqueue(db, seq, owner(), text, `job:${JOB}:${key}`); // a topic per week: one week never supersedes another
  db.query('INSERT INTO job_runs (job, key, at, result, detail, outbox_key) VALUES (?, ?, ?, ?, ?, ?)').run(JOB, key, iso(at), 'queued', detail, `hq-ev${seq}-${owner()}`);
  return getRun(db, key)!;
}
