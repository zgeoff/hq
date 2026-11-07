import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import { buildRowSchema } from '../db/build-row-schema.ts';
import type { HqTables } from '../db/hq-columns.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const LanesSampleSchema = buildRowSchema('lanes_samples');

export function readLanesSamples(db: Database): Selectable<HqTables['lanes_samples']>[] {
  return runSyncQuery(db, kdb(db).selectFrom('lanes_samples').selectAll().orderBy('seq').compile(), LanesSampleSchema);
}
