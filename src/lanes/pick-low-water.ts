// Fewer than this many eligible Ready issues, or the free slots if more, is low.
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

// above: the episode is over. low: eligible work is under the mark and a fresh promotable count says
// triage has issues to promote. unclear: under the mark, with no fresh promotable count above 0; the
// episode neither starts nor ends. The promotable test is the one buildSlotCause applies.
export function pickLowWater(look: LowWaterLook): { mark: number; phase: LowWaterPhase } {
  // Slots that are about to free are left out: the tick cannot see them.
  const mark = Math.max(MIN_MARK, look.free);
  if (look.eligible >= mark) {
    return { mark, phase: 'above' };
  }
  const promotable = look.promotable;
  const fresh = promotable !== null && promotable.count !== null && promotable.focus === look.focus && look.at.getTime() - Date.parse(promotable.at) <= look.freshMinutes * 60_000;
  return { mark, phase: fresh && promotable.count! > 0 ? 'low' : 'unclear' };
}
