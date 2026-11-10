import type { Database } from 'bun:sqlite';
import invariant from 'tiny-invariant';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import { logEvent } from '../log-event.ts';
import type { ScheduleValue, SessionJob } from './types.ts';

const SessionJobSchema = buildRowSchema('session_jobs');

export interface NewJob {
  target: string;
  value: ScheduleValue;
  prompt: string;
  nextAt: Date;
  actor: string;
}

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

export function readJob(db: Database, id: number): SessionJob | null {
  return runSyncRow(db, kdb(db).selectFrom('session_jobs').selectAll().where('id', '=', id).compile(), SessionJobSchema);
}

export function readJobs(db: Database, target: string | null): SessionJob[] {
  const query = kdb(db).selectFrom('session_jobs').selectAll().where('removed_at', 'is', null).orderBy('id');
  return runSyncQuery(db, (target === null ? query : query.where('target', '=', target)).compile(), SessionJobSchema);
}

export function removeJob(db: Database, id: number, actor: string): SessionJob {
  return db
    .transaction(() => {
      const job = readJob(db, id);
      if (job === null || job.removed_at !== null) {
        throw new HqError('not_found', `no job ${id}`);
      }
      db.query('UPDATE session_jobs SET removed_at = ? WHERE id = ?').run(iso(now()), id);
      logEvent(db, 'hq', `job:${id}`, 'job-removed', actor, null, null, { target: job.target });
      return job;
    })
    .immediate();
}
