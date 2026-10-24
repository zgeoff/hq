import type { Database } from 'bun:sqlite';
import { buildSlotCause } from './build-slot-cause.ts';
import { readSlotCauseInput } from './read-slot-cause-input.ts';
import type { SlotPlan } from './read-slot-plan.ts';
import type { SlotCause } from './types.ts';

// The cause of the empty slots now, from the clocks the lanes tick keeps. It writes nothing, so hq
// lanes can show it between ticks.
export function readSlotCause(db: Database, slotPlan: SlotPlan | null, at: Date): SlotCause {
  return buildSlotCause(readSlotCauseInput(db, slotPlan, at));
}
