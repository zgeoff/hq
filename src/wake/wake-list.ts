import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import type { WakeEntry } from './types.ts';

const WakeEntrySchema = buildRowSchema('wake_list');

export function wakeList(db: Database): WakeEntry[] {
  return runSyncQuery(db, kdb(db).selectFrom('wake_list').selectAll().orderBy('added_at').orderBy('name').compile(), WakeEntrySchema);
}
