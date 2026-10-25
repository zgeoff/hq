import { formatCapLine } from './cap/format-cap-line.ts';
import { formatFocusLine } from '../focus/format-focus-line.ts';
import type { SlotPlan } from './read-slot-plan.ts';

// hq lanes' view of the plan: the pool, the local sessions against their cap, the focus, and what the
// free slots take now.
export function formatSlotPlan(slotPlan: SlotPlan, at: Date): string[] {
  const pool = slotPlan.pool;
  const held = pool.held === null ? '' : ` (${Math.max(0, pool.impSize - pool.impRunning)} free by count, held: ${pool.held})`;
  const localNotes = [pool.localSource, pool.localHeld].filter((note) => note !== null);
  const localHeld = localNotes.length === 0 ? '' : ` (${localNotes.join('; ')})`;
  const plan = slotPlan.plan;
  const capLine = formatCapLine(slotPlan.cap);
  return [
    `slots (running/size, free now): imp ${pool.impRunning}/${pool.impSize}, ${pool.impFree} free${held}; local ${pool.localRunning}/${pool.localSize}, ${pool.localFree} free${localHeld}`,
    ...(capLine === null ? [] : [capLine]),
    `local: ${pool.localRunning} of ${pool.localSize} delivery sessions on this host`,
    `focus: ${slotPlan.focus === null ? 'none (all eligible work by priority)' : formatFocusLine(slotPlan.focus)}`,
    plan === null ? 'next: Ready unknown (no fresh read from Linear)' : `next: ${plan.picks.length === 0 ? 'nothing' : plan.picks.map((pick) => pick.issue).join(', ')} (${slotPlan.eligible ?? 0} eligible${formatReadyAge(slotPlan.readyReadAt, at)})`,
    ...(plan?.lent ?? []).map((lent) => `  lent: ${lent.slots} slot(s) reserved for ${lent.area}, nothing eligible`),
    ...(slotPlan.design === null ? [] : [`design slot, when it is free: ${slotPlan.design}`]),
  ];
}

function formatReadyAge(readyReadAt: string | null, at: Date): string {
  if (readyReadAt === null) {
    return '';
  }
  const minutes = Math.floor((at.getTime() - Date.parse(readyReadAt)) / 60_000);
  return minutes < 1 ? '; Ready read just now' : `; Ready read ${minutes} min ago`;
}
