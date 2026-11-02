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
  capHeld: boolean;
  held: string | null;
  localHeld: string | null;
  localSource: string | null;
}

interface SlotLimits {
  room: ImpRoom | null;
  localRoom: number | null;
  capRoom: number | null;
}

export function buildSlotPool(slots: PacingSlots, running: Pick<RunningByPlace, 'imp' | 'local' | 'localSource'>, limits: SlotLimits): SlotPool {
  const impSize = slots.imp;
  const localSize = slots.local;
  const impOpen = Math.max(0, impSize - running.imp);
  const impFree = Math.min(impOpen, limits.room?.slots ?? 0);
  const localOpen = Math.max(0, localSize - running.local);
  const localFree = limits.localRoom === null ? localOpen : Math.min(localOpen, Math.max(0, limits.localRoom - running.local));
  const held = impFree < impOpen ? (limits.room?.heldBy ?? 'no imp reading') : null;
  const localHeld = localFree < localOpen && limits.localRoom !== null ? formatLocalHeld(localFree, limits.localRoom) : null;
  const poolFree = impFree + localFree;
  const free = limits.capRoom === null ? poolFree : Math.min(poolFree, limits.capRoom);
  return { impSize, localSize, impRunning: running.imp, localRunning: running.local, impFree, localFree, free, capHeld: free < poolFree, held, localHeld, localSource: running.localSource };
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
