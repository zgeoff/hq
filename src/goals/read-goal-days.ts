import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import { buildRowSchema } from '../db/build-row-schema.ts';
import type { HqTables } from '../db/hq-columns.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const GoalDaySchema = buildRowSchema('goal_days');

export function readGoalDays(db: Database, kind: string): Selectable<HqTables['goal_days']>[] {
  return runSyncQuery(db, kdb(db).selectFrom('goal_days').selectAll().where('kind', '=', kind).orderBy('day').orderBy('key').compile(), GoalDaySchema);
}
