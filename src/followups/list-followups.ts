import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { FollowupRowSchema } from './followup-row-schema.ts';
import type { Followup } from './types.ts';

export function listFollowups(db: Database): Followup[] {
  return runSyncQuery(db, kdb(db).selectFrom('followups').selectAll().orderBy('filed_at').orderBy('issue').compile(), FollowupRowSchema);
}
