import type { SlotPlan } from './read-slot-plan.ts';

// The nudge to z-delivery: the free slots and how long they waited, then the issues to take in order,
// each with why (a focus term, a reserve), the reserves lent, and the design slot's issue.
export function formatSlotNudge(slotPlan: SlotPlan, minutes: number): string {
  const free = `${slotPlan.pool.free} slot${slotPlan.pool.free === 1 ? '' : 's'} free for ${minutes} min (imp ${slotPlan.pool.impFree}, local ${slotPlan.pool.localFree})`;
  const tail = '(hq lanes shows the plan, hq focus the focus; capacity.sh still picks the provider and where it runs, and you write the briefs.)';
  if (slotPlan.plan === null) {
    return `${free}, Ready unknown: hq has no fresh Ready read from Linear, so it names no issues. Fill by priority, and report Ready by hand with hq lanes ready --lane name=n,... while the read fails. ${tail}`;
  }
  const picks = slotPlan.plan.picks.map((pick) => `${pick.issue}${formatReason(slotPlan, pick)}`);
  const parts = [
    ...(picks.length === 0 ? [] : [`${free}. Take, in this order: ${picks.join(', ')}.`]),
    ...slotPlan.plan.lent.map((lent) => `Reserved for ${lent.area} with nothing eligible, lent: ${lent.slots}.`),
    ...(slotPlan.design === null ? [] : [`Design slot free: take ${slotPlan.design}.`]),
  ];
  return `${parts.join(' ')} ${tail}`;
}

function formatReason(slotPlan: SlotPlan, pick: NonNullable<SlotPlan['plan']>['picks'][number]): string {
  if (pick.reserve !== null) {
    return ` (reserve ${pick.reserve})`;
  }
  const term = pick.term === null ? undefined : slotPlan.focus?.terms[pick.term];
  return term === undefined || pick.term === null ? '' : ` (focus ${pick.term + 1}: ${term.text})`;
}
