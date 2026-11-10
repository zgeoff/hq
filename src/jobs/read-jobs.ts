import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import type { SessionJob } from './types.ts';

const SessionJobSchema = buildRowSchema('session_jobs');

export function readJobs(db: Database, target: string | null): SessionJob[] {
  const query = kdb(db).selectFrom('session_jobs').selectAll().where('removed_at', 'is', null).orderBy('id');
  return runSyncQuery(db, (target === null ? query : query.where('target', '=', target)).compile(), SessionJobSchema);
}
