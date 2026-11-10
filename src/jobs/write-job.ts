import type { Database } from 'bun:sqlite';
import invariant from 'tiny-invariant';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { readJob } from './read-job.ts';
import type { NewJob, SessionJob } from './types.ts';

export function writeJob(db: Database, job: NewJob): SessionJob {
  return db
    .transaction(() => {
      const at = iso(now());
      const inserted = db
        .query('INSERT INTO session_jobs (target, kind, spec, prompt, added_by, added_at, next_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(job.target, job.value.kind, job.value.spec, job.prompt, job.actor, at, iso(job.nextAt));
      const id = Number(inserted.lastInsertRowid);
      logEvent(db, 'hq', `job:${id}`, 'job-added', job.actor, null, null, { target: job.target, kind: job.value.kind, spec: job.value.spec });
      const written = readJob(db, id);
      invariant(written, 'the job just written is readable in the same transaction');
      return written;
    })
    .immediate();
}
