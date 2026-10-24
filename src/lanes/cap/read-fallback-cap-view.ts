import type { Database } from 'bun:sqlite';
import { slotsFrom } from '../slots-from.ts';
import type { Sample } from '../types.ts';
import { buildCapView } from './build-cap-view.ts';
import type { CapView } from './build-cap-view.ts';
import { countWorking } from './count-working.ts';
import { readActiveCap } from './read-active-cap.ts';
import { readCappedImpRoom } from './read-capped-imp-room.ts';

export function readFallbackCapView(db: Database, sample: Sample, at: Date): CapView {
  const budgetSlots = sample.cap ? slotsFrom(sample.cap, sample.impMib).slots : 0;
  const room = readCappedImpRoom(db, { budgetSlots, impMib: sample.impMib }, at);
  return buildCapView(readActiveCap(db, at), countWorking(db, at), { capHeld: room.capHeld });
}
