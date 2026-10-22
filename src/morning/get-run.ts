import type { Database } from 'bun:sqlite';
import { JOB } from './job.ts';
import type { JobRun } from './types.ts';

export function getRun(db: Database, key: string): JobRun | null {
  return db.query('SELECT * FROM job_runs WHERE job = ? AND key = ?').get(JOB, key) as JobRun | null;
}
