import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import { buildRowSchema } from '../db/build-row-schema.ts';
import type { HqTables } from '../db/hq-columns.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const RefusalFileSchema = buildRowSchema('refusal_files');

export function readRefusalFiles(db: Database): Selectable<HqTables['refusal_files']>[] {
  return runSyncQuery(db, kdb(db).selectFrom('refusal_files').selectAll().orderBy('path').compile(), RefusalFileSchema);
}
