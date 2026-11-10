import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import type { SessionJob } from './types.ts';

const SessionJobSchema = buildRowSchema('session_jobs');

export function readJob(db: Database, id: number): SessionJob | null {
  return runSyncRow(db, kdb(db).selectFrom('session_jobs').selectAll().where('id', '=', id).compile(), SessionJobSchema);
}
