import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import type { Selectable } from 'kysely';
import { buildRowSchema } from '../db/build-row-schema.ts';
import type { HqTables } from '../db/hq-columns.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const StoredRefusalSchema = buildRowSchema('refusals');

export function readRefusalRows(db: Database): Selectable<HqTables['refusals']>[] {
  return runSyncQuery(db, kdb(db).selectFrom('refusals').selectAll().orderBy(sql`rowid`).compile(), StoredRefusalSchema);
}
