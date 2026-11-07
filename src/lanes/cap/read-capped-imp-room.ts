import type { Database } from 'bun:sqlite';
import type { Impd } from '../../capacity/types.ts';
import { loadImpRoom } from '../load-imp-room.ts';
import { countWorking } from './count-working.ts';
import { readActiveCap } from './read-active-cap.ts';

export interface CappedSlots {
  slots: number;
  capHeld: boolean;
}

export function readCappedImpRoom(db: Database, size: Parameters<typeof loadImpRoom>[1], at: Date, capAt: Date, live: Impd | null): CappedSlots {
  const room = loadImpRoom(db, size, at, live).slots;
  const active = readActiveCap(db, capAt);
  if (active === null) {
    return { slots: room, capHeld: false };
  }
  const capRoom = Math.max(0, active.cap - countWorking(db, at).count);
  return { slots: Math.min(room, capRoom), capHeld: capRoom < room };
}
