import { match } from 'ts-pattern';
import type { SlotMinutes } from './read-slot-minutes.ts';
import type { SlotCause, SlotCauseUnknownReason } from './types.ts';

export function formatSlotCause(slotCause: SlotCause, today: SlotMinutes, capHeld: boolean): string[] {
  const designMinutes = today.design < 0.5 ? [] : [`empty agent design lane-minutes today (Sydney), apart from the slot-minutes: ${Math.round(today.design)}`];
  return [`cause: ${formatNow(slotCause, capHeld)}`, `empty slot-minutes today (Sydney): delivery ${Math.round(today.delivery)}, triage ${Math.round(today.triage)}, supply ${Math.round(today.supply)}`, ...designMinutes];
}

function formatNow(slotCause: SlotCause, capHeld: boolean): string {
  if (slotCause.slots === 0) {
    return capHeld ? 'none (cap reached)' : 'none (no free slot)';
  }
  if (slotCause.cause === null) {
    return `none yet, Ready waiting ${slotCause.waitingMinutes ?? 0} min`;
  }
  if (slotCause.reason !== null) {
    const error = slotCause.backlogError === null ? '' : ` (${slotCause.backlogError})`;
    return `unknown, ${formatUnknown(slotCause.reason, slotCause.readyAgeMinutes)}${error}`;
  }
  const since = slotCause.since === null ? '' : ` since ${slotCause.since}`;
  return `${slotCause.cause}, ${slotCause.slots} free slot(s)${since}`;
}

function formatUnknown(reason: SlotCauseUnknownReason, readyAgeMinutes: number | null): string {
  return match(reason)
    .with('ready_never_read', () => 'Ready never read')
    .with('ready_stale', () => `Ready data ${readyAgeMinutes ?? '?'} min old`)
    .with('backlog_unknown', () => 'Backlog count unavailable')
    .with('backlog_focus_changed', () => 'Backlog count made for an earlier focus')
    .with('backlog_stale', () => 'Backlog count stale')
    .exhaustive();
}
