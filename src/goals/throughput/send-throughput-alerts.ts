import type { Database } from 'bun:sqlite';
import { logEvent } from '../../log-event.ts';
import { enqueue } from '../../outbox/enqueue.ts';
import { findRoleName } from '../../roles/find-role-name.ts';
import { THROUGHPUT_LINES } from './throughput-lines.ts';

// Each flagged item goes once, as its own message, to the session holding its alert's role (triage by
// default); the send's event marks it sent. [from, at) is the last Linear read's window, not the Sydney
// day, so an issue filed just before midnight and read just after still alerts.
export function sendThroughputAlerts(db: Database, actor: string, from: Date, at: Date): string[] {
  return db
    .transaction(() => {
      const sent: string[] = [];
      for (const read of THROUGHPUT_LINES) {
        for (const alert of read(db, from, at).alerts) {
          const subjectID = `goals-alert:${alert.key}`;
          if (db.query(`SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'alerted'`).get(subjectID)) {
            continue;
          }
          const target = findRoleName(alert.role ?? 'triage');
          if (target === null) {
            continue;
          }
          const seq = logEvent(db, 'hq', subjectID, 'alerted', actor, null, null, { to: target });
          enqueue(db, seq, target, alert.text, subjectID);
          sent.push(alert.key);
        }
      }
      return sent;
    })
    .immediate();
}
