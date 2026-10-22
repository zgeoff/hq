import type { ImpRoom, LaneConfig } from '../areas/types.ts';

export interface SlotPool {
  impSize: number;
  localSize: number;
  impRunning: number;
  localRunning: number;
  impFree: number;
  localFree: number;
  free: number;

  // Why fewer imp slots are free than the imp size leaves, or null when none is held back.
  held: string | null;
}

// The lanes' slots as one pool: pacing.json's imp and local slot counts summed, less the runs that
// hold a slot. Imp slots stay under capacity.sh's budget and impd's non-Nix line (room; null: no reading).
export function buildSlotPool(lanes: readonly LaneConfig[], running: { imp: number; local: number }, room: ImpRoom | null): SlotPool {
  const impSize = sumSize(lanes, 'imp');
  const localSize = sumSize(lanes, 'local');
  const impOpen = Math.max(0, impSize - running.imp);
  const impFree = Math.min(impOpen, room?.slots ?? 0);
  const localFree = Math.max(0, localSize - running.local);
  const held = impFree < impOpen ? (room?.heldBy ?? 'no imp reading') : null;
  return { impSize, localSize, impRunning: running.imp, localRunning: running.local, impFree, localFree, free: impFree + localFree, held };
}

function sumSize(lanes: readonly LaneConfig[], place: LaneConfig['place']): number {
  return lanes.filter((lane) => lane.place === place).reduce((sum, lane) => sum + lane.size, 0);
}
