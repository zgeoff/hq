import type { Focus } from './types.ts';

export function formatFocusLine(focus: Pick<Focus, 'terms' | 'reserves'>): string {
  const terms = focus.terms.map((term) => term.text).join(', ');
  return focus.reserves.length === 0 ? terms : `${terms}; reserve ${focus.reserves.map((reserve) => `${reserve.area}=${reserve.slots}`).join(', ')}`;
}
