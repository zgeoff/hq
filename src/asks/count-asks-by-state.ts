import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const AskCountSchema = buildRowSchema('asks').pick({ kind: true, state: true }).extend({ count: z.number() });

export function countAsksByState(db: Database): z.output<typeof AskCountSchema>[] {
  const query = kdb(db)
    .selectFrom('asks')
    .select(['kind', 'state'])
    .select((eb) => eb.fn.countAll().as('count'))
    .groupBy(['kind', 'state'])
    .compile();
  return runSyncQuery(db, query, AskCountSchema);
}
