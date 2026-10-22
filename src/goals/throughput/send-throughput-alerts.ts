import type { Database } from 'bun:sqlite';
import { now } from '../../clock/now.ts';
import { logEvent } from '../../log-event.ts';
import { sydneyUtc } from '../../morning/sydney-utc.ts';
import { sydney } from '../../morning/sydney.ts';
import { enqueue } from '../../outbox/enqueue.ts';
import { findRoleName } from '../../roles/find-role-name.ts';
import { THROUGHPUT_LINES } from './throughput-lines.ts';

// Each throughput item a line flags goes to the triage session as its own message, once: the event that
// records the send is the mark, so a later pass skips it.
export function sendThroughputAlerts(db: Database, actor: string, at: Date = now()): string[] {
  const today = sydney(at);
  const midnight = sydneyUtc(today.y, today.mo, today.d);
  const triage = findRoleName('triage');
  if (triage === null) {
    return [];
  }
  return db
    .transaction(() => {
      const sent: string[] = [];
      for (const read of THROUGHPUT_LINES) {
        for (const alert of read(db, midnight, at).alerts) {
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
