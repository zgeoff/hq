import type { Database } from 'bun:sqlite';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { RunSchema } from './run-schema.ts';
import type { Run } from './types.ts';

export function getRun(db: Database, issue: string): Run | null {
  return runSyncRow(db, kdb(db).selectFrom('runs').selectAll().where('issue', '=', issue).compile(), RunSchema);
}
