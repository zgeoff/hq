import type { Database } from 'bun:sqlite';
import { AtcClient } from '../atc/atc-client.ts';
import { fleetIds } from '../atc/fleet-ids.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import { isQuietHeld } from '../is-quiet-held.ts';
import type { FlushResult, OutboxRow } from './types.ts';
import { unsent } from './unsent.ts';

// Send what is pending, after the transition committed. A failure stays in
// the outbox for `hq outbox flush`; it never fails the command that queued it.
// With ids, send only those rows; without, every pending row (the watcher, `hq outbox flush`).
export async function flush(db: Database, opts: { retryFailed?: boolean; ids?: number[] } = {}): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, dropped: 0, skipped: false, errors: [] };
  const rows = unsent(db, opts.retryFailed ?? false, opts.ids, '*') as OutboxRow[];
  if (rows.length === 0) return result;
  if (config().HQ_NOTIFY === 'off') {
    result.skipped = true;
    return result;
  }
  const known = fleetIds(db);
  let client: AtcClient;
  try {
    client = await AtcClient.open();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    result.failed = markFailed(db, rows, reason);
    if (result.failed > 0) {
      result.errors.push(reason);
    }
    return result;
  }
  try {
    for (const row of rows) {
      // A "ready" notice for an item that left the queue before it went out is stale.
      const readyId = row.topic?.startsWith('ready:') ? row.topic.slice(6) : null;
      if (readyId) {
        const a = db.query('SELECT state FROM asks WHERE id = ?').get(readyId) as { state: string } | null;
        if (!a || a.state !== 'queued') {
          db.query('DELETE FROM outbox WHERE id = ?').run(row.id);
          result.dropped++;
          continue;
        }
      }
      if (isQuietHeld(row.topic, now())) {
        continue;
      }
      // Read the row again: a forward or a drop may have changed it since the select.
      const cur = db.query('SELECT target, idem_key, status FROM outbox WHERE id = ?').get(row.id) as { target: string; idem_key: string; status: string } | null;
      if (!cur || cur.status === 'sent') continue;
      const still = () => (db.query('SELECT idem_key, status FROM outbox WHERE id = ?').get(row.id) as { idem_key: string; status: string } | null)?.idem_key === cur.idem_key;
      try {
        const session = await client.resolve(cur.target, known);
        if (!still()) continue; // forwarded or dropped while atc resolved the old name
        const messageId = await client.message(session.id, row.text, 'hq', cur.idem_key);
        db.query(`UPDATE outbox SET status='sent', attempts=attempts+1, message_id=?, sent_at=?, last_error=NULL WHERE id=? AND idem_key=?`).run(
          messageId ?? null,
          iso(now()),
          row.id,
          cur.idem_key,
        );
        result.sent++;
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        if (!still()) continue; // the row moved on; its new target gets its own try
        // Another flush sent it meanwhile: that is no failure of this one.
        if (markFailed(db, [{ id: row.id, idem_key: cur.idem_key }], msg) === 0) {
          continue;
        }
        result.failed++;
        result.errors.push(`${row.target}: ${msg}`);
      }
    }
  } finally {
    client.close();
  }
  return result;
}

// Another flush may have sent the row, or a forward rekeyed it, while this one waited on atc.
function markFailed(db: Database, rows: Pick<OutboxRow, 'id' | 'idem_key'>[], error: string): number {
  const update = db.query(`UPDATE outbox SET status='failed', attempts=attempts+1, last_error=? WHERE id=? AND idem_key=? AND status != 'sent'`);
  return rows.reduce((marked, row) => marked + update.run(error, row.id, row.idem_key).changes, 0);
}
