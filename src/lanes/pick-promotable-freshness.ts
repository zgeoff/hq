// Whether a stored promotable count still speaks for the Backlog: read under the current focus and
// no older than freshMinutes. buildSlotCause and pickLowWater both use it, so the triage cause and
// the low-water message never disagree about the count.
export type PromotableFreshness = 'fresh' | 'focus_changed' | 'stale';

interface PromotableLook {
  promotable: { at: string; focus: string };
  focus: string;
  freshMinutes: number;
  at: Date;
}

export function pickPromotableFreshness(look: PromotableLook): PromotableFreshness {
  if (look.promotable.focus !== look.focus) {
    return 'focus_changed';
  }
  return look.at.getTime() - Date.parse(look.promotable.at) > look.freshMinutes * 60_000 ? 'stale' : 'fresh';
}
