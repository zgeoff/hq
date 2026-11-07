import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const DaySchema = buildRowSchema('merged_pr_days').pick({ day: true });

export function readFetchedDays(db: Database): Set<string> {
  return new Set(runSyncQuery(db, kdb(db).selectFrom('merged_pr_days').select('day').compile(), DaySchema).map((row) => row.day));
}
