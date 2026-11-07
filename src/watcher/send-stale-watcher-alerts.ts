import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { flush } from '../outbox/flush.ts';

const OutboxIDSchema = buildRowSchema('outbox').pick({ id: true });

// The watcher retries failed rows, but a stuck watcher cannot retry its own alert.
export async function sendStaleWatcherAlerts(db: Database): Promise<void> {
  const query = kdb(db).selectFrom('outbox').select('id').where('topic', '=', 'watcher-stale').where('status', 'in', ['pending', 'failed']).orderBy('id').compile();
  const rows = runSyncQuery(db, query, OutboxIDSchema);
  if (rows.length > 0) {
    await flush(db, { retryFailed: true, ids: rows.map((row) => row.id) });
  }
}
