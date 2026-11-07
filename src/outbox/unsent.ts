import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { OutboxSchema } from './outbox-schema.ts';
import type { OutboxRow } from './types.ts';

export function unsent(db: Database, retryFailed: boolean, ids: number[] | undefined): OutboxRow[] {
  if (ids?.length === 0) {
    return [];
  }
  const states = retryFailed ? (['pending', 'failed'] as const) : (['pending'] as const);
  const base = kdb(db).selectFrom('outbox').selectAll().where('status', 'in', states);
  const query = (ids === undefined ? base : base.where('id', 'in', ids)).orderBy('id').compile();
  return runSyncQuery(db, query, OutboxSchema);
}
