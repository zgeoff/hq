import type { ImpRoom } from '../areas/types.ts';
import type { RunningByPlace } from './read-running-by-place.ts';
import type { PacingSlots } from './types.ts';

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

// The lanes' slots as one pool: pacing.json's imp and local slot caps, less the runs that hold a slot.
// Imp slots stay under capacity.sh's budget and impd's non-Nix line (room; null: no reading).
export function buildSlotPool(slots: PacingSlots, running: Pick<RunningByPlace, 'imp' | 'local'>, room: ImpRoom | null): SlotPool {
  const impSize = slots.imp;
  const localSize = slots.local;
  const impOpen = Math.max(0, impSize - running.imp);
  const impFree = Math.min(impOpen, room?.slots ?? 0);
  const localFree = Math.max(0, localSize - running.local);
  const held = impFree < impOpen ? (room?.heldBy ?? 'no imp reading') : null;
  return { impSize, localSize, impRunning: running.imp, localRunning: running.local, impFree, localFree, free: impFree + localFree, held };
}

