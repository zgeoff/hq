import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { JOB } from './job.ts';
import type { JobRun } from './types.ts';

const JobRunSchema = buildRowSchema('job_runs');

export function getRun(db: Database, key: string): JobRun | null {
  return runSyncRow(db, kdb(db).selectFrom('job_runs').selectAll().where('job', '=', JOB).where('key', '=', key).compile(), JobRunSchema);
}
