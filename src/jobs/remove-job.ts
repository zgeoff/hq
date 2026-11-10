import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { readJob } from './read-job.ts';
import type { SessionJob } from './types.ts';

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
