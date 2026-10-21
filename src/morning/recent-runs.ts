import type { Database } from 'bun:sqlite';
import { JOB } from './job.ts';
import type { JobRun } from './types.ts';

export function recentRuns(db: Database, limit = 14): (JobRun & { sent: string | null })[] {
  return db
    .query(`SELECT j.*, o.status AS sent FROM job_runs j LEFT JOIN outbox o ON o.idem_key = j.outbox_key WHERE j.job = ? ORDER BY j.key DESC LIMIT ?`)
    .all(JOB, limit) as (JobRun & { sent: string | null })[];
}
