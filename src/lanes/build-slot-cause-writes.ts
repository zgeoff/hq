import { iso } from '../clock/iso.ts';
import { buildSlotCause } from './build-slot-cause.ts';
import type { SlotCauseInput } from './build-slot-cause.ts';
import type { SlotCauseAction, SlotCauseState } from './slot-cause-transitions.ts';
import type { SlotCause } from './types.ts';

interface SlotCauseWrites {
  eligibleSince: string | null;
  move: { action: SlotCauseAction; to: SlotCauseState } | null;
  slotCause: SlotCause;
}

export function buildSlotCauseWrites(stored: SlotCauseInput, capacityKnown: boolean): SlotCauseWrites {
  const eligibleSince = pickEligibleSince(stored, capacityKnown);
  const slotCause = buildSlotCause({ ...stored, eligibleSince });
  const kept = stored.causeSince;
  if (!capacityKnown || (slotCause.cause !== null && kept?.cause === slotCause.cause)) {
    return { eligibleSince, move: null, slotCause };
  }
  if (slotCause.cause === null) {
    return { eligibleSince, move: kept === null ? null : { action: 'cause-ended', to: 'none' }, slotCause };
  }
  const action = kept === null ? 'cause-began' : 'cause-changed';
  return { eligibleSince, move: { action, to: slotCause.cause }, slotCause: { ...slotCause, since: iso(stored.at) } };
}

function pickEligibleSince(stored: SlotCauseInput, capacityKnown: boolean): string | null {
  if (!capacityKnown) {
    return stored.eligibleSince;
  }
  if (stored.free === 0 || stored.eligible === 0 || stored.unfit >= stored.free) {
    return null;
  }
  if (stored.eligible !== null && stored.eligibleSince === null) {
    return iso(stored.at);
  }
  return stored.eligibleSince;
}
