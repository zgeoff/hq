import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { forwardOf } from '../outbox/forward-of.ts';
import { pickDueJobs } from './pick-due-jobs.ts';
import { readJobs } from './write-job.ts';

const JOB = 'session-job';

export interface FiredJob {
  id: number;
  target: string;
  slot: string;
}

// Each due job sends one message to its role by name, so atc finds the role's current session
// whatever its id is. The job_runs key names the slot, so a slot never fires twice.
export function runSessionJobsTick(db: Database, actor: string, at: Date = now()): FiredJob[] {
  return db
    .transaction(() => {
      const fired: FiredJob[] = [];
      for (const due of pickDueJobs(readJobs(db, null), at)) {
        const job = due.job;
        const slot = due.slot;
        const nextAt = due.nextAt;
        const key = `${job.id}:${slot}`;
        const seen = db.query('SELECT 1 AS seen FROM job_runs WHERE job = ? AND key = ?').get(JOB, key) !== null;
        if (!seen) {
          const seq = logEvent(db, 'hq', `job:${job.id}`, 'job-fired', actor, null, null, { slot, target: job.target });
          enqueue(db, seq, job.target, `hq job ${job.id}: ${job.prompt}`, `${JOB}:${job.id}`);
          db.query('INSERT INTO job_runs (job, key, at, result, detail, outbox_key) VALUES (?, ?, ?, ?, ?, ?)').run(JOB, key, iso(at), 'queued', null, `hq-ev${seq}-${forwardOf(db, job.target)}`);
          fired.push({ id: job.id, target: job.target, slot });
        }
        if (nextAt === null) {
          db.query('UPDATE session_jobs SET removed_at = ? WHERE id = ?').run(iso(at), job.id);
        } else {
          db.query('UPDATE session_jobs SET next_at = ? WHERE id = ?').run(nextAt, job.id);
        }
      }
      return fired;
    })
    .immediate();
}
