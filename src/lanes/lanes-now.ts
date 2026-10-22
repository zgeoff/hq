import type { Database } from 'bun:sqlite';
import { buildLaneViews } from '../areas/build-lane-views.ts';
import { readReadyByLane } from '../areas/read-ready-by-lane.ts';
import { runningByLane } from '../areas/running-by-lane.ts';
import type { LaneView } from '../areas/types.ts';
import { LANES } from './lanes.ts';
import { loadImpRoom } from './load-imp-room.ts';
import { slotsFrom } from './slots-from.ts';
import type { Sample } from './types.ts';

// Per-lane state now: running runs, free slots under the imp memory cap and impd's non-Nix line,
// Ready per lane.
export function lanesNow(db: Database, sample: Sample): LaneView[] | null {
  if (!sample.lanes || !sample.cap) return null;
  return buildLaneViews(sample.lanes, runningByLane(db), readReadyByLane(db, LANES.readyFreshMinutes(), LANES.readyZeroFreshMinutes()), loadImpRoom(db, { budgetSlots: slotsFrom(sample.cap, sample.impMib).slots, impMib: sample.impMib }));
}
