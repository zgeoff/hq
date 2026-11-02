import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { getMeta } from '../db/get-meta.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { STALLED_TRIAGE_TOPIC } from './lanes-alert-topics.ts';
import { LOW_WATER_SINCE_KEY } from './low-water-since-key.ts';
import { pickStalledTriage } from './pick-stalled-triage.ts';
import type { SlotCause } from './types.ts';

const SENT_AT = z.object({ sent_at: z.string() }).nullable();

interface StalledTriageAlert {
  slotCause: SlotCause;
  held: boolean;
  at: Date;
  actor: string;
}

// Tells the owner when triage has left free slots empty for 30 minutes. pickStalledTriage decides; this
// reads its inputs and queues what it picked. Returns whether it sent.
export function sendStalledTriageAlert(db: Database, alert: StalledTriageAlert): boolean {
  const since = alert.slotCause.since;
  const lowWaterSince = getMeta(db, LOW_WATER_SINCE_KEY);
  const message = pickStalledTriage({
    slotCause: alert.slotCause,
    held: alert.held,
    at: alert.at,
    alerted: since !== null && probeAlerted(db, `slot-cause-stalled:triage:${since}`),
    toldAt: lowWaterSince === null ? null : readDeliveredAt(db, `low-water:${lowWaterSince}`),
  });
  if (message === null) {
    return false;
  }
  const target = owner();
  const seq = logEvent(db, 'hq', message.subjectID, 'alerted', alert.actor, null, null, { to: target, slots: alert.slotCause.slots, minutes: message.minutes });
  enqueue(db, seq, target, message.text, STALLED_TRIAGE_TOPIC);
  return true;
}

function probeAlerted(db: Database, subjectID: string): boolean {
  return db.query(`SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'alerted'`).get(subjectID) !== null;
}

// When the alert's message reached its session: the sent_at of its outbox row, or null while it waits.
function readDeliveredAt(db: Database, subjectID: string): string | null {
  const row = SENT_AT.parse(
    db.query(`SELECT outbox.sent_at FROM outbox JOIN events ON events.seq = outbox.event_seq WHERE events.subject = 'hq' AND events.subject_id = ? AND events.action = 'alerted' AND outbox.status = 'sent' AND outbox.sent_at IS NOT NULL ORDER BY outbox.sent_at LIMIT 1`).get(subjectID),
  );
  return row?.sent_at ?? null;
}
