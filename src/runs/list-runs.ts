import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { RunSchema } from './run-schema.ts';
import type { RunView } from './types.ts';
import { viewRun } from './view-run.ts';

export function listRuns(db: Database, all = false): RunView[] {
  const query = kdb(db)
    .selectFrom('runs')
    .selectAll()
    .$if(!all, (builder) => builder.where('state', 'not in', ['done', 'dropped']))
    .orderBy('created_at')
    .compile();
  return runSyncQuery(db, query, RunSchema).map((r) => viewRun(db, r));
}
