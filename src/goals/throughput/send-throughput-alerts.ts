import type { Database } from 'bun:sqlite';
import { logEvent } from '../../log-event.ts';
import { enqueue } from '../../outbox/enqueue.ts';
import { findRoleName } from '../../roles/find-role-name.ts';
import { THROUGHPUT_LINES } from './throughput-lines.ts';

// Each throughput item a line flags in [from, at) goes to the triage session as its own message,
// once: the event that records the send is the mark, so a later pass skips it. The caller passes the
// window it just read from Linear, not the Sydney day: an issue filed just before midnight and read
// just after still alerts.
export function sendThroughputAlerts(db: Database, actor: string, from: Date, at: Date): string[] {
  const triage = findRoleName('triage');
  if (triage === null) {
    return [];
  }
  return db
    .transaction(() => {
      const sent: string[] = [];
      for (const read of THROUGHPUT_LINES) {
        for (const alert of read(db, from, at).alerts) {
          const subjectID = `goals-alert:${alert.key}`;
          if (db.query(`SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'alerted'`).get(subjectID)) {
            continue;
          }
          const seq = logEvent(db, 'hq', subjectID, 'alerted', actor, null, null, { to: triage });
          enqueue(db, seq, triage, alert.text, subjectID);
          sent.push(alert.key);
        }
      }
      return sent;
    })
    .immediate();
}
