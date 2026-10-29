import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { buildDesignCause } from './build-design-cause.ts';
import type { DesignCause } from './build-design-cause.ts';
import { DESIGN_WAITING_SINCE_KEY } from './design-waiting-since-key.ts';
import type { SlotPlan } from './read-slot-plan.ts';

// Follows how long an agent design lane has sat free beside a waiting needs-design ticket. With no slot
// plan the wait is unknown and starts over.
export function trackDesignCause(db: Database, slotPlan: SlotPlan | null, at: Date): DesignCause {
  const stored = getMeta(db, DESIGN_WAITING_SINCE_KEY);
  const cause = buildDesignCause({ waitingLanes: slotPlan?.design.agent.next.length ?? 0, waitingSince: stored, at });
  if (cause.waitingSince !== stored) {
    setMeta(db, DESIGN_WAITING_SINCE_KEY, cause.waitingSince);
  }
  return cause;
}
