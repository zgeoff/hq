import type { Database } from 'bun:sqlite';
import { loadImpRoom } from '../load-imp-room.ts';
import { countWorking } from './count-working.ts';
import { readActiveCap } from './read-active-cap.ts';

export interface CappedSlots {
  slots: number;
  capHeld: boolean;
}

export function readCappedImpRoom(db: Database, size: Parameters<typeof loadImpRoom>[1], at: Date): CappedSlots {
  const room = loadImpRoom(db, size, at).slots;
  const active = readActiveCap(db, at);
  if (active === null) {
    return { slots: room, capHeld: false };
  }
  const capRoom = Math.max(0, active.cap - countWorking(db, at).count);
  return { slots: Math.min(room, capRoom), capHeld: capRoom < room };
}
