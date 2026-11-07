import type { Database } from 'bun:sqlite';
import type { Impd } from '../../capacity/types.ts';
import { loadImpRoom } from '../load-imp-room.ts';
import { countWorking } from './count-working.ts';
import { readActiveCap } from './read-active-cap.ts';

export interface CappedSlots {
  slots: number;
  capHeld: boolean;
}

interface CappedLook {
  at: Date;
  capAt: Date;
  impd: Impd | null;
}

export function readCappedImpRoom(db: Database, size: Parameters<typeof loadImpRoom>[1], look: CappedLook): CappedSlots {
  const room = loadImpRoom(db, size, look.at, look.impd).slots;
  const active = readActiveCap(db, look.capAt);
  if (active === null) {
    return { slots: room, capHeld: false };
  }
  const capRoom = Math.max(0, active.cap - countWorking(db, look.at).count);
  return { slots: Math.min(room, capRoom), capHeld: capRoom < room };
}
