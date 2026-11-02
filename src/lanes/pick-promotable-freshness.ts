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
