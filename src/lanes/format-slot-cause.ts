import { LANES } from './lanes.ts';
import type { SlotMinutes } from './read-slot-minutes.ts';
import type { SlotCause } from './types.ts';

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
  if (slotCause.cause === 'unknown') {
    return `unknown, ${formatUnknown(slotCause.readyAgeMinutes)}`;
  }
  const since = slotCause.since === null ? '' : ` since ${slotCause.since}`;
  return `${slotCause.cause}, ${slotCause.slots} free slot(s)${since}`;
}

function formatUnknown(readyAgeMinutes: number | null): string {
  if (readyAgeMinutes === null) {
    return 'Ready never read';
  }
  if (readyAgeMinutes > LANES.readyFreshMinutes()) {
    return `Ready data ${readyAgeMinutes} min old`;
  }
  return 'Backlog count unavailable';
}
