import { pickPromotableFreshness } from './pick-promotable-freshness.ts';

const MIN_MARK = 3;

interface LowWaterLook {
  eligible: number;
  free: number;
  promotable: { at: string; count: number | null; focus: string } | null;
  focus: string;
  freshMinutes: number;
  at: Date;
}

export type LowWaterPhase = 'above' | 'low' | 'unclear';

export function pickLowWater(look: LowWaterLook): { mark: number; phase: LowWaterPhase } {
  const mark = Math.max(MIN_MARK, look.free);
  if (look.eligible >= mark) {
    return { mark, phase: 'above' };
  }
  const promotable = look.promotable;
  if (promotable === null || promotable.count === null || promotable.count === 0) {
    return { mark, phase: 'unclear' };
  }
  const freshness = pickPromotableFreshness({ promotable, focus: look.focus, freshMinutes: look.freshMinutes, at: look.at });
  return { mark, phase: freshness === 'fresh' ? 'low' : 'unclear' };
}
