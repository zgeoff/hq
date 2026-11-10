import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { forwardOf } from '../outbox/forward-of.ts';
import { pickDueJobs } from './pick-due-jobs.ts';
import type { BrokenJob } from './types.ts';
import { readJobs } from './read-jobs.ts';

const JOB = 'session-job';

export interface FiredJob {
  id: number;
  target: string;
  slot: string;
}

export interface SkippedJob {
  id: number;
  target: string;
  reason: string;
}

export interface SessionJobsTick {
  fired: FiredJob[];
  skipped: SkippedJob[];
}

// Each due job sends one message to its role by name, so atc finds the role's current session
// whatever its id is. Firing moves next_at past the slot, and the job_runs key names the slot, so
// a slot can never fire twice.
export function runSessionJobsTick(db: Database, actor: string, at: Date = now()): SessionJobsTick {
  return db
    .transaction(() => {
      const picked = pickDueJobs(readJobs(db, null), at);
      const skipped: SkippedJob[] = [];
      for (const broken of picked.broken) {
        if (writeBrokenJobOnce(db, actor, at, broken)) {
          skipped.push({ id: broken.job.id, target: broken.job.target, reason: broken.reason });
        }
      }
      const fired: FiredJob[] = [];
      for (const due of picked.due) {
        const job = due.job;
        const seq = logEvent(db, 'hq', `job:${job.id}`, 'job-fired', actor, null, null, { slot: due.slot, target: job.target });
        enqueue(db, seq, job.target, `hq job ${job.id}: ${job.prompt}`, `${JOB}:${job.id}`);
        db.query('INSERT INTO job_runs (job, key, at, result, detail, outbox_key) VALUES (?, ?, ?, ?, ?, ?)').run(JOB, `${job.id}:${due.slot}`, iso(at), 'queued', null, `hq-ev${seq}-${forwardOf(db, job.target)}`);
        fired.push({ id: job.id, target: job.target, slot: due.slot });
        if (due.nextAt === null) {
          db.query('UPDATE session_jobs SET removed_at = ? WHERE id = ?').run(iso(at), job.id);
        } else {
          db.query('UPDATE session_jobs SET next_at = ? WHERE id = ?').run(due.nextAt, job.id);
        }
      }
      return { fired, skipped };
    })
    .immediate();
}

// A broken job stays due on every tick, so its job_runs row records the skip once and keeps the
// event log and the watcher log from growing every 5 minutes.
function writeBrokenJobOnce(db: Database, actor: string, at: Date, broken: BrokenJob): boolean {
  const written = db.query('INSERT OR IGNORE INTO job_runs (job, key, at, result, detail, outbox_key) VALUES (?, ?, ?, ?, ?, NULL)').run(JOB, `${broken.job.id}:broken`, iso(at), 'skipped', broken.reason);
  if (written.changes === 0) {
    return false;
  }
  logEvent(db, 'hq', `job:${broken.job.id}`, 'job-skipped', actor, null, null, { reason: broken.reason });
  return true;
}
