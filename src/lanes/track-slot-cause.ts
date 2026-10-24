import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { buildSlotCauseWrites } from './build-slot-cause-writes.ts';
import { ELIGIBLE_SINCE_KEY } from './eligible-since-key.ts';
import { readSlotCauseInput } from './read-slot-cause-input.ts';
import type { SlotPlan } from './read-slot-plan.ts';
import type { SlotCause } from './types.ts';
import { writeSlotCauseMove } from './write-slot-cause-move.ts';

export function trackSlotCause(db: Database, slotPlan: SlotPlan | null, at: Date): SlotCause {
  const stored = readSlotCauseInput(db, slotPlan, at);
  const writes = buildSlotCauseWrites(stored, slotPlan !== null);
  if (writes.eligibleSince !== stored.eligibleSince) {
    setMeta(db, ELIGIBLE_SINCE_KEY, writes.eligibleSince);
  }
  if (writes.move !== null) {
    writeSlotCauseMove(db, writes.move.action, writes.move.to, at);
  }
  return writes.slotCause;
}
