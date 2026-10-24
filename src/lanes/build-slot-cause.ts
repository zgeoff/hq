import { LANES } from './lanes.ts';
import type { SlotCause } from './types.ts';

// Ready work that has waited this long beside a free slot is a delivery gap; before that, hq tags
// nothing, since a launch takes a few minutes.
const DELIVERY_GRACE_MINUTES = 10;

export interface SlotCauseInput {
  free: number;

  // Eligible Ready issues; null while the Ready read is missing or stale.
  eligible: number | null;
  eligibleSince: string | null;
  readyAt: string | null;
  promotable: { at: string; count: number | null } | null;
  causeSince: { cause: string; since: string } | null;
  at: Date;
}

// The cause of the empty slots at an instant. Pure: the caller reads the clocks and counts.
export function buildSlotCause(input: SlotCauseInput): SlotCause {
  const readyAgeMinutes = input.readyAt === null ? null : Math.floor((input.at.getTime() - Date.parse(input.readyAt)) / 60_000);
  const base = { slots: input.free, readyAgeMinutes, waitingMinutes: null };
  if (input.free === 0) {
    return { ...base, cause: null, since: null };
  }
  const sinceOf = (cause: string): string | null => (input.causeSince?.cause === cause ? input.causeSince.since : null);
  if (input.eligible === null) {
    return { ...base, cause: 'unknown', since: sinceOf('unknown') };
  }
  if (input.eligible > 0) {
    const waitingMinutes = input.eligibleSince === null ? 0 : Math.floor((input.at.getTime() - Date.parse(input.eligibleSince)) / 60_000);
    if (waitingMinutes > DELIVERY_GRACE_MINUTES) {
      return { ...base, cause: 'delivery', since: sinceOf('delivery') };
    }
    return { ...base, cause: null, since: input.eligibleSince, waitingMinutes };
  }
  const promotable = input.promotable;
  if (promotable === null || promotable.count === null || input.at.getTime() - Date.parse(promotable.at) > LANES.readyFreshMinutes() * 60_000) {
    return { ...base, cause: 'unknown', since: sinceOf('unknown') };
  }
  const cause = promotable.count > 0 ? 'triage' : 'supply';
  return { ...base, cause, since: sinceOf(cause) };
}
