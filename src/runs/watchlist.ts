import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { RunSessionSchema } from './run-session-schema.ts';

const WatchSchema = RunSessionSchema.pick({ session_id: true, issue: true });

export function watchlist(db: Database): { session_id: string; issue: string }[] {
  const query = kdb(db)
    .selectFrom('run_sessions as s')
    .innerJoin('runs as r', 'r.issue', 's.issue')
    .select(['s.session_id', 's.issue'])
    .where('s.active', '=', 1)
    .where('r.state', 'not in', ['done', 'dropped'])
    .orderBy('s.added_at')
    .compile();
  return runSyncQuery(db, query, WatchSchema);
}
