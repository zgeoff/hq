import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { OutboxSchema } from './outbox-schema.ts';

const StatusCountSchema = OutboxSchema.pick({ status: true }).extend({ count: z.number() });

export function countUnsentByStatus(db: Database): Record<string, number> {
  const query = kdb(db)
    .selectFrom('outbox')
    .select('status')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('status', '!=', 'sent')
    .groupBy('status')
    .compile();
  return Object.fromEntries(runSyncQuery(db, query, StatusCountSchema).map((row) => [row.status, row.count]));
}
