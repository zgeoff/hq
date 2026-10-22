import type { Focus } from './types.ts';

// `bug, maintenance:nixie; reserve nixie=1`: the terms in order, then any reserves.
export function formatFocusLine(focus: Pick<Focus, 'terms' | 'reserves'>): string {
  const terms = focus.terms.map((term) => term.text).join(', ');
  return focus.reserves.length === 0 ? terms : `${terms}; reserve ${focus.reserves.map((reserve) => `${reserve.area}=${reserve.slots}`).join(', ')}`;
}
