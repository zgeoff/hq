import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import type { FlushResult } from '../outbox/types.ts';

const OutboxProgressSchema = buildRowSchema('outbox').pick({ id: true, status: true, attempts: true, last_error: true });

export async function awaitDetached(db: Database, start: { id: number; attempts: number }[], timeoutMs: number): Promise<FlushResult & { pending: number }> {
  const until = Date.now() + timeoutMs;
  const before = new Map(start.map((r) => [r.id, r.attempts]));
  const ids = start.map((r) => r.id);
  for (;;) {
    const query = kdb(db).selectFrom('outbox').select(['id', 'status', 'attempts', 'last_error']).where('id', 'in', ids).compile();
    const rows = ids.length > 0 ? runSyncQuery(db, query, OutboxProgressSchema) : [];
    const sent = rows.filter((r) => r.status === 'sent').length;
    const failed = rows.filter((r) => r.status === 'failed' && r.attempts > (before.get(r.id) ?? 0));
    const pending = rows.length - sent - failed.length;
    if (pending === 0 || Date.now() >= until) {
      return { sent, failed: failed.length, dropped: ids.length - rows.length, skipped: false, errors: failed.map((r) => r.last_error ?? 'failed'), pending };
    }
    await Bun.sleep(250);
  }
}
