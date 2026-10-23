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

  // Why fewer local slots are free than the local size leaves, or null when none is held back.
  localHeld: string | null;

  // Why more local slots run than the runs filed local hold, or null when those runs set the count.
  localSource: string | null;
}

// The lanes' slots as one pool: pacing.json's imp and local slot caps, less the runs that hold a slot.
// Imp slots stay under capacity.sh's budget and impd's non-Nix line (room; null: no reading). Local
// slots stay under localRoom, what unattended providers may run on this host (null: no cap but the size).
export function buildSlotPool(slots: PacingSlots, running: Pick<RunningByPlace, 'imp' | 'local' | 'localSource'>, room: ImpRoom | null, localRoom: number | null): SlotPool {
  const impSize = slots.imp;
  const localSize = slots.local;
  const impOpen = Math.max(0, impSize - running.imp);
  const impFree = Math.min(impOpen, room?.slots ?? 0);
  const localOpen = Math.max(0, localSize - running.local);
  const localFree = localRoom === null ? localOpen : Math.min(localOpen, Math.max(0, localRoom - running.local));
  const held = impFree < impOpen ? (room?.heldBy ?? 'no imp reading') : null;
  const localHeld = localFree < localOpen && localRoom !== null ? formatLocalHeld(localFree, localRoom) : null;
  return { impSize, localSize, impRunning: running.imp, localRunning: running.local, impFree, localFree, free: impFree + localFree, held, localHeld, localSource: running.localSource };
}

function formatLocalHeld(localFree: number, localRoom: number): string {
  if (localRoom === 0) {
    return 'no unattended provider can start local work';
  }
  if (localFree === 0) {
    return `no unattended provider can start local work: localFallback ${localRoom} in use`;
  }
  return `localFallback ${localRoom} caps unattended local work`;
}
