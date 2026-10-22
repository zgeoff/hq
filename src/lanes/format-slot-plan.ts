import { formatFocusLine } from '../focus/format-focus-line.ts';
import type { SlotPlan } from './read-slot-plan.ts';

// hq lanes' view of the plan: the pool, the focus, and what the free slots take now.
export function formatSlotPlan(slotPlan: SlotPlan): string[] {
  const pool = slotPlan.pool;
  const held = pool.held === null ? '' : ` (${Math.max(0, pool.impSize - pool.impRunning)} free by count, held: ${pool.held})`;
  const plan = slotPlan.plan;
  return [
    `slots (running/size, free now): imp ${pool.impRunning}/${pool.impSize}, ${pool.impFree} free${held}; local ${pool.localRunning}/${pool.localSize}, ${pool.localFree} free`,
    `focus: ${slotPlan.focus === null ? 'none (all eligible work by priority)' : formatFocusLine(slotPlan.focus)}`,
    plan === null ? 'next: Ready unknown (no fresh read from Linear)' : `next: ${plan.picks.length === 0 ? 'nothing' : plan.picks.map((pick) => pick.issue).join(', ')} (${slotPlan.eligible ?? 0} eligible)`,
    ...(plan?.lent ?? []).map((lent) => `  lent: ${lent.slots} slot(s) reserved for ${lent.area}, nothing eligible`),
    ...(slotPlan.design === null ? [] : [`design slot: ${slotPlan.design}`]),
  ];
}
