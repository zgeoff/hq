import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { OutboxSchema } from './outbox-schema.ts';
import type { OutboxRow } from './types.ts';

// Every row not yet sent, failed ones included.
export function listUnsentRows(db: Database): OutboxRow[] {
  return runSyncQuery(db, kdb(db).selectFrom('outbox').selectAll().where('status', '!=', 'sent').orderBy('id').compile(), OutboxSchema);
}
