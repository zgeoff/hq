import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { getMeta } from '../db/get-meta.ts';
import { logEvent } from '../log-event.ts';
import { sydney } from '../morning/sydney.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { LOW_WATER_SINCE_KEY } from './low-water-since-key.ts';
import type { SlotCause } from './types.ts';

const STALLED_MINUTES = 30;
const SENT_AT = z.object({ at: z.string() }).nullable();

interface StalledTriageAlert {
  slotCause: SlotCause;
  held: boolean;
  at: Date;
  actor: string;
}

// Tells the owner once per triage cause episode when free slots have waited 30 minutes for promotion, with
// the time z-triage got the low-water message if the current low-water episode sent one. Quiet hours stop
// nothing: the owner's session holds any push itself. A lanes hold stops it. Returns whether it sent.
export function sendStalledTriageAlert(db: Database, alert: StalledTriageAlert): boolean {
  const since = alert.slotCause.since;
  const slots = alert.slotCause.slots;
  if (alert.held || alert.slotCause.cause !== 'triage' || slots < 1 || since === null) {
    return false;
  }
  const minutes = Math.floor((alert.at.getTime() - Date.parse(since)) / 60_000);
  if (minutes < STALLED_MINUTES) {
    return false;
  }
  const subjectID = `slot-cause-stalled:triage:${since}`;
  if (db.query(`SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'alerted'`).get(subjectID)) {
    return false;
  }
  const lowWaterSince = getMeta(db, LOW_WATER_SINCE_KEY);
  const sent = lowWaterSince === null ? null : SENT_AT.parse(db.query(`SELECT at FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'alerted'`).get(`low-water:${lowWaterSince}`));
  const when = sent === null ? null : sydney(new Date(sent.at));
  const told = when === null ? '' : ` z-triage got the low-water message at ${String(when.h).padStart(2, '0')}:${String(when.mi).padStart(2, '0')}.`;
  const target = owner();
  const seq = logEvent(db, 'hq', subjectID, 'alerted', alert.actor, null, null, { to: target, slots, minutes });
  enqueue(db, seq, target, `Lanes: ${slots} slots empty for ${minutes} min with Backlog issues to promote (triage).${told}`, subjectID);
  return true;
}
