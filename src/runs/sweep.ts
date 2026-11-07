import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { kdb } from '../kdb.ts';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { dropTopic } from '../outbox/drop-topic.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { countMinutesSince as mins } from './count-minutes-since.ts';
import { formatSweepText } from './format-sweep-text.ts';
import { SWEEP_MINUTES as SWEEP } from './sweep-minutes.ts';
import type { Alert } from './types.ts';

const AlertSchema = buildRowSchema('run_alerts');

export function sweep(db: Database, alerts: Alert[], actor: string): { sent: Alert[]; held: number } {
  return db
    .transaction(() => {
      const t = now();
      const keys = new Set(alerts.map((a) => a.key));
      for (const row of runSyncQuery(db, kdb(db).selectFrom('run_alerts').select('key').compile(), AlertSchema.pick({ key: true }))) {
        if (!keys.has(row.key)) db.query('DELETE FROM run_alerts WHERE key = ?').run(row.key);
      }
      const due = alerts.filter((a) => {
        const previous = runSyncRow(db, kdb(db).selectFrom('run_alerts').select(['fingerprint', 'sent_at', 'event_seq']).where('key', '=', a.key).compile(), AlertSchema.pick({ fingerprint: true, sent_at: true, event_seq: true }));
        if (!previous || previous.fingerprint !== a.fingerprint || mins(previous.sent_at, t) >= SWEEP.repeatMinutes()) {
          return true;
        }
        const delivered = previous.event_seq !== null && db.query(`SELECT 1 FROM outbox WHERE event_seq = ? AND status = 'sent'`).get(previous.event_seq);
        return !delivered;
      });
      if (alerts.length === 0) dropTopic(db, orchestratorName(), 'run-sweep');
      if (due.length === 0 || due.every((a) => !isNews(db, a, t))) return { sent: [], held: alerts.length };
      const text = formatSweepText(due);
      const seq = logEvent(db, 'run', 'sweep', 'alerted', actor, null, null, { alerts: due.map((a) => a.key) });
      enqueue(db, seq, orchestratorName(), text, 'run-sweep');
      for (const a of due) {
        db.query(
          'INSERT INTO run_alerts (key, fingerprint, sent_at, event_seq) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET fingerprint = excluded.fingerprint, sent_at = excluded.sent_at, event_seq = excluded.event_seq',
        ).run(a.key, a.fingerprint, iso(t), seq);
      }
      return { sent: due, held: alerts.length - due.length };
    })
    .immediate();
}

// An undelivered alert alone waits for the outbox retry instead of re-queueing every tick.
function isNews(db: Database, a: Alert, t: Date): boolean {
  const previous = runSyncRow(db, kdb(db).selectFrom('run_alerts').select(['fingerprint', 'sent_at']).where('key', '=', a.key).compile(), AlertSchema.pick({ fingerprint: true, sent_at: true }));
  return !previous || previous.fingerprint !== a.fingerprint || mins(previous.sent_at, t) >= SWEEP.repeatMinutes();
}
