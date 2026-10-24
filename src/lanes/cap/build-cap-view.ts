import type { SlotPool } from '../build-slot-pool.ts';
import type { WorkingCount } from './count-working.ts';
import type { LanesCap } from './lanes-cap.ts';

export interface CapView {
  cap: number | null;
  until: string | null;
  reason: string | null;
  by: string | null;
  working: number;
  limitedBy: 'cap' | 'pool' | null;

  // Whether working counts awake sessions, or the working runs as no atc reading is fresh.
  workingFrom: WorkingCount['from'];
}

export function buildCapView(cap: LanesCap | null, working: WorkingCount, pool: Pick<SlotPool, 'capHeld'>): CapView {
  let limitedBy: CapView['limitedBy'] = null;
  if (cap !== null) {
    limitedBy = pool.capHeld ? 'cap' : 'pool';
  }
  return { cap: cap?.cap ?? null, until: cap?.until ?? null, reason: cap?.reason ?? null, by: cap?.by ?? null, working: working.count, limitedBy, workingFrom: working.from };
}
