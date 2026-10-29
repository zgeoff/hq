import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { isQuiet } from '../clock/is-quiet.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { findRoleName } from '../roles/find-role-name.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import type { SlotCauseName } from './types.ts';

const SLOT_ALERT_MINUTES = 60;

interface SlotCauseAlert {
  day: string;
  cause: SlotCauseName;
  minutes: number;
  free: number;
  at: Date;
  actor: string;
}

const REASONS: Record<SlotCauseName, string> = {
  delivery: 'with Ready work waiting',
  triage: 'with no Ready work and Backlog issues waiting to be promoted',
  supply: 'with no Ready work and no Backlog issue to promote',
  design: 'with needs-design tickets waiting for an agent design lane',
};

// Tells the session that owns a cause once per Sydney day when the cause's slot-minutes reach 60.
// The owner's supply alert waits out quiet hours; the others go at any hour. Returns whether it sent.
export function sendSlotCauseAlert(db: Database, alert: SlotCauseAlert): boolean {
  if (alert.minutes < SLOT_ALERT_MINUTES) {
    return false;
  }
  const subjectID = `slot-cause:${alert.day}:${alert.cause}`;
  if (db.query(`SELECT 1 FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'alerted'`).get(subjectID)) {
    return false;
  }
  const target = match(alert.cause)
    .with('delivery', 'design', () => orchestratorName())
    .with('triage', () => findRoleName('triage'))
    .with('supply', () => (isQuiet(alert.at) ? null : owner()))
    .exhaustive();
  if (target === null) {
    return false;
  }
  const seq = logEvent(db, 'hq', subjectID, 'alerted', alert.actor, null, null, { to: target, minutes: Math.floor(alert.minutes), free: alert.free });
  enqueue(db, seq, target, `Lanes: ${Math.floor(alert.minutes)} slot-minutes empty today ${REASONS[alert.cause]} (${alert.cause}). Free slots: ${alert.free}.`, subjectID);
  return true;
}
