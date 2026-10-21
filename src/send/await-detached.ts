import type { Database } from 'bun:sqlite';
import type { FlushResult } from '../outbox/types.ts';

// Inside an atc session the send goes through a detached unit (see detachFlush); if that
// can't start, hq sends inline, and the answers come back to this session as before.
// After a detached handoff, wait for the unit to settle this command's rows, so the
// result says what was sent, as an inline send does. Rows still pending at the deadline
// are reported as pending; the unit or the watcher sends them later.
export async function awaitDetached(db: Database, start: { id: number; attempts: number }[], timeoutMs: number): Promise<FlushResult & { pending: number }> {
  const until = Date.now() + timeoutMs;
  const before = new Map(start.map((r) => [r.id, r.attempts]));
  const ids = start.map((r) => r.id);
  for (;;) {
    const rows = ids.length
      ? (db.query(`SELECT id, status, attempts, last_error FROM outbox WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { id: number; status: string; attempts: number; last_error: string | null }[])
      : [];
    const sent = rows.filter((r) => r.status === 'sent').length;
    // A row that was already failed (a --retry) counts only once the unit has tried it again.
    const failed = rows.filter((r) => r.status === 'failed' && r.attempts > (before.get(r.id) ?? 0));
    const pending = rows.length - sent - failed.length;
    if (pending === 0 || Date.now() >= until) {
      return { sent, failed: failed.length, dropped: ids.length - rows.length, skipped: false, errors: failed.map((r) => r.last_error ?? 'failed'), pending };
    }
    await Bun.sleep(250);
  }
}
