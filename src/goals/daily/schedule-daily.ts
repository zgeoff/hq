import type { Database } from 'bun:sqlite';
import { logEvent } from '../../log-event.ts';
import { owner } from '../../owner.ts';
import { iso } from '../../clock/iso.ts';
import type { JobRun } from '../../morning/types.ts';
import { enqueue } from '../../outbox/enqueue.ts';
import { dailyText } from './daily-text.ts';
import { getRun } from './get-run.ts';
import { JOB } from './job.ts';

interface RunRequest {
  actor: string;
  at: Date;
  key: string;
  detail: string | null;
}

export function scheduleDaily(db: Database, run: RunRequest): JobRun {
  const actor = run.actor,
    at = run.at,
    date = run.key,
    detail = run.detail;
  const seq = logEvent(db, 'hq', `job:${JOB}`, 'ran', actor, null, null, { key: date, detail });
  enqueue(db, seq, owner(), dailyText(db, at), `job:${JOB}:${date}`); // a topic per day: one day never supersedes another
  db.query('INSERT INTO job_runs (job, key, at, result, detail, outbox_key) VALUES (?, ?, ?, ?, ?, ?)').run(JOB, date, iso(at), 'queued', detail, `hq-ev${seq}-${owner()}`);
  return getRun(db, date)!;
}
