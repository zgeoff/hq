import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { NudgeRowSchema } from './nudge-row-schema.ts';
import type { NudgeRow } from './types.ts';

export function nudgeLog(db: Database, limit: number): NudgeRow[] {
  return runSyncQuery(db, kdb(db).selectFrom('lanes_nudges').select(['id', 'at', 'slots', 'free_minutes', 'eligible', 'slots_after', 'checked_at']).orderBy('id', 'desc').limit(limit).compile(), NudgeRowSchema);
}
