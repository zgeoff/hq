import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { dropTopic } from '../outbox/drop-topic.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { countMinutesSince as mins } from './count-minutes-since.ts';
import { SWEEP_MINUTES as SWEEP } from './sweep-minutes.ts';
import type { Alert } from './types.ts';

// Send what is new, or unchanged for 30 minutes, as one message. Clears
// the record of alerts that went away, so a recurrence is news again.
export function sweep(db: Database, alerts: Alert[], actor: string): { sent: Alert[]; held: number } {
  return db
    .transaction(() => {
      const t = now();
      const keys = new Set(alerts.map((a) => a.key));
      for (const row of db.query('SELECT key FROM run_alerts').all() as { key: string }[]) {
        if (!keys.has(row.key)) db.query('DELETE FROM run_alerts WHERE key = ?').run(row.key);
      }
      const due = alerts.filter((a) => {
        const prev = db.query('SELECT fingerprint, sent_at, event_seq FROM run_alerts WHERE key = ?').get(a.key) as { fingerprint: string; sent_at: string; event_seq: number | null } | null;
        if (!prev || prev.fingerprint !== a.fingerprint || mins(prev.sent_at, t) >= SWEEP.repeatMinutes()) return true;
        // Not yet delivered (pending, failed, or superseded): it rides along in the next message.
        const delivered = prev.event_seq !== null && db.query(`SELECT 1 FROM outbox WHERE event_seq = ? AND status = 'sent'`).get(prev.event_seq);
        return !delivered;
      });
      if (alerts.length === 0) dropTopic(db, orchestratorName(), 'run-sweep');
      if (due.length === 0 || due.every((a) => !isNews(db, a, t))) return { sent: [], held: alerts.length };
      const text = `hq run sweep: ${due.length} to look at.\n${due.map((a) => `- ${a.line}`).join('\n')}\nRecord a review with hq run reviewed <pr> --sha <head>.`;
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

// New, changed, or 30 minutes on: worth a message by itself. An undelivered
// alert alone waits for the outbox retry instead of re-queueing every tick.
function isNews(db: Database, a: Alert, t: Date): boolean {
  const prev = db.query('SELECT fingerprint, sent_at FROM run_alerts WHERE key = ?').get(a.key) as { fingerprint: string; sent_at: string } | null;
  return !prev || prev.fingerprint !== a.fingerprint || mins(prev.sent_at, t) >= SWEEP.repeatMinutes();
}
