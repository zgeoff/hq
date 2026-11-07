import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { OutboxSchema } from './outbox-schema.ts';
import type { OutboxRow } from './types.ts';

export function readOutboxRows(db: Database): OutboxRow[] {
  return runSyncQuery(db, kdb(db).selectFrom('outbox').selectAll().orderBy('id').compile(), OutboxSchema);
}
