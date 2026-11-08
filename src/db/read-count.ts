import type { Database } from 'bun:sqlite';
import type { CompiledQuery } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { runSyncQuery } from './run-sync-query.ts';

const CountRowSchema = z.object({ count: z.number() });

// The `count` of a query that selects one COUNT(*) AS count and no GROUP BY.
export function readCount(db: Database, query: CompiledQuery): number {
  const [row] = runSyncQuery(db, query, CountRowSchema);
  invariant(row, 'a COUNT query without GROUP BY returns one row');
  return row.count;
}
