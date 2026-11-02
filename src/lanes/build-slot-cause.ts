import { DELIVERY_GRACE_MINUTES } from './delivery-grace-minutes.ts';
import { pickPromotableFreshness } from './pick-promotable-freshness.ts';
import type { SlotCause } from './types.ts';

export interface SlotCauseInput {
  free: number;
  unfit: number;
  eligible: number | null;
  eligibleSince: string | null;
  readyAt: string | null;
  promotable: { at: string; count: number | null; focus: string; error: string | null } | null;
  focus: string;
  causeSince: { cause: string; since: string } | null;
  freshMinutes: number;
  at: Date;
}

export function buildSlotCause(input: SlotCauseInput): SlotCause {
  const readyAgeMinutes = input.readyAt === null ? null : Math.floor((input.at.getTime() - Date.parse(input.readyAt)) / 60_000);
  const base = { slots: input.free, readyAgeMinutes, reason: null, waitingMinutes: null, backlogError: null };
  if (input.free === 0) {
    return { ...base, cause: null, since: null };
  }
  const sinceOf = (cause: string): string | null => (input.causeSince?.cause === cause ? input.causeSince.since : null);
  if (input.eligible === null) {
    return { ...base, cause: 'unknown', reason: input.readyAt === null ? 'ready_never_read' : 'ready_stale', since: sinceOf('unknown') };
  }
  if (input.eligible > 0 && input.unfit >= input.free) {
    return { ...base, cause: 'supply', since: sinceOf('supply') };
  }
  if (input.eligible > 0) {
    const fillable = { ...base, slots: input.free - input.unfit };
    const waitingMs = input.eligibleSince === null ? 0 : input.at.getTime() - Date.parse(input.eligibleSince);
    if (waitingMs > DELIVERY_GRACE_MINUTES * 60_000) {
      return { ...fillable, cause: 'delivery', since: sinceOf('delivery') };
    }
    return { ...fillable, cause: null, since: input.eligibleSince, waitingMinutes: Math.floor(waitingMs / 60_000) };
  }
  const promotable = input.promotable;
  if (promotable === null || promotable.count === null) {
    return { ...base, cause: 'unknown', reason: 'backlog_unknown', since: sinceOf('unknown'), backlogError: promotable?.error ?? null };
  }
  const freshness = pickPromotableFreshness({ promotable, focus: input.focus, freshMinutes: input.freshMinutes, at: input.at });
  if (freshness !== 'fresh') {
    return { ...base, cause: 'unknown', reason: freshness === 'focus_changed' ? 'backlog_focus_changed' : 'backlog_stale', since: sinceOf('unknown') };
  }
  const cause = promotable.count > 0 ? 'triage' : 'supply';
  return { ...base, cause, since: sinceOf(cause) };
}
