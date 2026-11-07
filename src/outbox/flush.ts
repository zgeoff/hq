import type { Database } from 'bun:sqlite';
import { AtcClient } from '../atc/atc-client.ts';
import { fleetIds } from '../atc/fleet-ids.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { isQuietHeld } from '../is-quiet-held.ts';
import { getLanesHold } from '../lanes/get-lanes-hold.ts';
import { kdb } from '../kdb.ts';
import { isLanesAlertTopic } from '../lanes/lanes-alert-topics.ts';
import { OutboxSchema } from './outbox-schema.ts';
import type { FlushResult, OutboxRow } from './types.ts';
import { unsent } from './unsent.ts';
import { toErrorMessage } from '../to-error-message.ts';

const AskStateSchema = buildRowSchema('asks').pick({ state: true });
const CurrentSchema = OutboxSchema.pick({ target: true, idem_key: true, status: true });
const KeySchema = OutboxSchema.pick({ idem_key: true });

export async function flush(db: Database, opts: { retryFailed?: boolean; ids?: number[] } = {}): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, dropped: 0, skipped: false, errors: [] };
  const rows = unsent(db, opts.retryFailed ?? false, opts.ids);
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
      const readyId = row.topic?.startsWith('ready:') ? row.topic.slice(6) : null;
      if (readyId) {
        const ask = runSyncRow(db, kdb(db).selectFrom('asks').select('state').where('id', '=', readyId).compile(), AskStateSchema);
        if (!ask || ask.state !== 'queued') {
          db.query('DELETE FROM outbox WHERE id = ?').run(row.id);
          result.dropped++;
          continue;
        }
      }
      if (isQuietHeld(row.topic, now())) {
        continue;
      }
      if (isLanesAlertTopic(row.topic) && getLanesHold(db) !== null) {
        continue;
      }
      // Read the row again: a forward or a drop may have changed it since the select.
      const cur = runSyncRow(db, kdb(db).selectFrom('outbox').select(['target', 'idem_key', 'status']).where('id', '=', row.id).compile(), CurrentSchema);
      if (!cur || cur.status === 'sent') continue;
      const still = () => runSyncRow(db, kdb(db).selectFrom('outbox').select('idem_key').where('id', '=', row.id).compile(), KeySchema)?.idem_key === cur.idem_key;
      try {
        const session = await client.resolve(cur.target, known);
        if (!still()) {
          continue;
        }
        const messageId = await client.message(session.id, row.text, 'hq', cur.idem_key);
        db.query(`UPDATE outbox SET status='sent', attempts=attempts+1, message_id=?, sent_at=?, last_error=NULL WHERE id=? AND idem_key=?`).run(
          messageId ?? null,
          iso(now()),
          row.id,
          cur.idem_key,
        );
        result.sent++;
      } catch (e) {
        const message = toErrorMessage(e);
        if (!still()) {
          continue;
        }
        // Another flush sent it meanwhile: that is no failure of this one.
        if (markFailed(db, [{ id: row.id, idem_key: cur.idem_key }], message) === 0) {
          continue;
        }
        result.failed++;
        result.errors.push(`${row.target}: ${message}`);
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
