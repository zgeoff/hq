import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import type { OutageRow } from './types.ts';

const OutageSchema = buildRowSchema('outages');

export function readOutageRows(db: Database): OutageRow[] {
  return runSyncQuery(db, kdb(db).selectFrom('outages').selectAll().orderBy('id').compile(), OutageSchema);
}
