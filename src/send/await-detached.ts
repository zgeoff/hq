import type { Database } from 'bun:sqlite';
import type { FlushResult } from '../outbox/types.ts';

export async function awaitDetached(db: Database, start: { id: number; attempts: number }[], timeoutMs: number): Promise<FlushResult & { pending: number }> {
  const until = Date.now() + timeoutMs;
  const before = new Map(start.map((r) => [r.id, r.attempts]));
  const ids = start.map((r) => r.id);
  for (;;) {
    const rows = ids.length
      ? (db.query(`SELECT id, status, attempts, last_error FROM outbox WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { id: number; status: string; attempts: number; last_error: string | null }[])
      : [];
    const sent = rows.filter((r) => r.status === 'sent').length;
    const failed = rows.filter((r) => r.status === 'failed' && r.attempts > (before.get(r.id) ?? 0));
    const pending = rows.length - sent - failed.length;
    if (pending === 0 || Date.now() >= until) {
      return { sent, failed: failed.length, dropped: ids.length - rows.length, skipped: false, errors: failed.map((r) => r.last_error ?? 'failed'), pending };
    }
    await Bun.sleep(250);
  }
}
