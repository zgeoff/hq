import { formatDesignLanes } from './format-design-lanes.ts';
import type { SlotPlan } from './read-slot-plan.ts';

const PLACE_FREE = [
  { place: 'imp', key: 'impFree' },
  { place: 'local', key: 'localFree' },
] as const;

// The nudge to z-delivery, leaving out a free slot no eligible issue fits: the free slots and how long they waited, then the issues to take in order,
// each with why (a focus term, a reserve), the reserves lent, and the design lanes when one has an issue waiting.
export function formatSlotNudge(slotPlan: SlotPlan, minutes: number): string {
  const unfit = slotPlan.plan?.unfit ?? { slots: 0, places: [] };
  const fitFree = slotPlan.pool.free - unfit.slots;
  const byPlace = PLACE_FREE.filter((entry) => !unfit.places.some((place) => place.place === entry.place)).map((entry) => `${entry.place} ${slotPlan.pool[entry.key]}`);
  const free = `${fitFree} slot${fitFree === 1 ? '' : 's'} free for ${minutes} min (${byPlace.join(', ')}${slotPlan.pool.capHeld ? `; the cap of ${slotPlan.cap.cap} holds the rest` : ''})`;
  const tail = '(hq lanes shows the plan, hq focus the focus; capacity.sh still picks the provider and where it runs, and you write the briefs.)';
  if (slotPlan.plan === null) {
    return `${free}, Ready unknown: hq has no fresh Ready read from Linear, so it names no issues. Fill by priority, and report Ready by hand with hq lanes ready --lane name=n,... while the read fails. ${tail}`;
  }
  const picks = slotPlan.plan.picks.map((pick) => `${pick.issue}${formatReason(slotPlan, pick)}`);
  const parts = [
    ...(picks.length === 0 ? [] : [`${free}. Take, in this order: ${picks.join(', ')}.`]),
    ...slotPlan.plan.lent.map((lent) => `Reserved for ${lent.area} with nothing eligible, lent: ${lent.slots}.`),
    ...(hasDesignWork(slotPlan) ? [`${formatDesignLanes(slotPlan.design)}.`] : []),
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

function hasDesignWork(slotPlan: SlotPlan): boolean {
  return slotPlan.design.agent.next.length > 0 || slotPlan.design.withGeoff.next.length > 0 || slotPlan.design.withGeoff.asked.length > 0;
}
