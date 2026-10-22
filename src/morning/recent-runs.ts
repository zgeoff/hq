import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { JOB } from './job.ts';
import { readOutboxStatus } from './read-outbox-status.ts';
import type { JobRun } from './types.ts';

const jobRuns = z.array(
  z.object({
    job: z.string(),
    key: z.string(),
    at: z.string(),
    result: z.enum(['queued', 'skipped']),
    detail: z.string().nullable(),
    outbox_key: z.string().nullable(),
  }),
);

export function recentRuns(db: Database, limit = 14): (JobRun & { sent: string | null })[] {
  const runs = jobRuns.parse(db.query(`SELECT job, key, at, result, detail, outbox_key FROM job_runs WHERE job = ? ORDER BY key DESC LIMIT ?`).all(JOB, limit));
  return runs.map((run) => Object.assign(run, { sent: readOutboxStatus(db, run.outbox_key) }));
}
