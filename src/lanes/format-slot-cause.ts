import { match } from 'ts-pattern';
import type { SlotMinutes } from './read-slot-minutes.ts';
import type { SlotCause, SlotCauseUnknownReason } from './types.ts';

// The two lines hq lanes prints: the cause of the empty slots now, and today's minutes by cause.
export function formatSlotCause(slotCause: SlotCause, today: SlotMinutes): string[] {
  return [`cause: ${formatNow(slotCause)}`, `empty slot-minutes today (Sydney): delivery ${Math.round(today.delivery)}, triage ${Math.round(today.triage)}, supply ${Math.round(today.supply)}`];
}

function formatNow(slotCause: SlotCause): string {
  if (slotCause.slots === 0) {
    return 'none (no free slot)';
  }
  if (slotCause.cause === null) {
    return `none yet, Ready waiting ${slotCause.waitingMinutes ?? 0} min`;
  }
  if (slotCause.reason !== null) {
    return `unknown, ${formatUnknown(slotCause.reason, slotCause.readyAgeMinutes)}`;
  }
  const since = slotCause.since === null ? '' : ` since ${slotCause.since}`;
  return `${slotCause.cause}, ${slotCause.slots} free slot(s)${since}`;
}

function formatUnknown(reason: SlotCauseUnknownReason, readyAgeMinutes: number | null): string {
  return match(reason)
    .with('ready_never_read', () => 'Ready never read')
    .with('ready_stale', () => `Ready data ${readyAgeMinutes ?? '?'} min old`)
    .with('backlog_unknown', () => 'Backlog count unavailable')
    .with('backlog_stale', () => 'Backlog count stale')
    .exhaustive();
}
