import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { getLanesHold } from './get-lanes-hold.ts';
import type { SlotPlan } from './read-slot-plan.ts';
import type { LaneSkip } from './types.ts';

const TOLD = 'lanes_all_skipped_told';

// Its own topic: the nudge's topic is purged each look while no slot is wanted, which would drop this
// alert unsent.
const TOPIC = 'lanes-all-skipped';

// Tells z-delivery once per spell that slots sit free and every eligible Ready issue is skipped. A
// change of the skip set tells again, and a look where the condition fails ends the spell. A lanes
// hold sends nothing.
export function checkAllSkipped(db: Database, slotPlan: SlotPlan, actor: string): boolean {
  if (slotPlan.pool.free === 0 || slotPlan.eligible !== 0 || slotPlan.skipped.length === 0) {
    setMeta(db, TOLD, null);
    return false;
  }
  if (getLanesHold(db)) {
    return false;
  }
  const key = slotPlan.skipped.map((skip) => `${skip.issue} ${skip.until}`).toSorted().join(', ');
  if (getMeta(db, TOLD) === key) {
    return false;
  }
  const seq = logEvent(db, 'hq', 'lanes', 'all-skipped', actor, null, null, { free: slotPlan.pool.free, skips: slotPlan.skipped.map((skip) => skip.issue) });
  enqueue(db, seq, orchestratorName(), formatAllSkipped(slotPlan), TOPIC);
  setMeta(db, TOLD, key);
  return true;
}

function formatAllSkipped(slotPlan: SlotPlan): string {
  const skips = formatCapped(slotPlan.skipped.map(formatSkip), '; ');
  return `Lanes: ${slotPlan.pool.free} slot(s) free, and every eligible Ready issue is skipped. Check each skip still holds: ${skips}. Drop one with hq lanes skip drop <issue>.`;
}

const MAX_LISTED = 20;

function formatCapped(items: readonly string[], separator: string): string {
  const shown = items.slice(0, MAX_LISTED).join(separator);
  return items.length > MAX_LISTED ? `${shown}${separator}and ${items.length - MAX_LISTED} more` : shown;
}

function formatSkip(skip: LaneSkip): string {
  return `${skip.issue} until ${skip.until}: ${skip.reason}`;
}
