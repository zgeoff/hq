import type { Database } from 'bun:sqlite';
import { CountSchema } from '../db/count-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';

export function unreadCount(db: Database): number {
  const query = kdb(db)
    .selectFrom('news')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('read_at', 'is', null)
    .compile();
  return runSyncRow(db, query, CountSchema)?.count ?? 0;
}
