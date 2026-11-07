import type { Database } from 'bun:sqlite';
import invariant from 'tiny-invariant';
import { CountSchema } from '../db/count-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

export function unreadCount(db: Database): number {
  const query = kdb(db)
    .selectFrom('news')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('read_at', 'is', null)
    .compile();
  const [row] = runSyncQuery(db, query, CountSchema);
  invariant(row, 'COUNT(*) with no GROUP BY returns one row');
  return row.count;
}
