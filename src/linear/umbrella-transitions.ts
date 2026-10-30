import type { UmbrellaOutcome } from './types.ts';

// A box stays undecided until hq decides it once; a decided outcome is final. Every write to
// umbrella_boxes.outcome checks its move against this table, so a move the table lacks cannot happen.
export const UMBRELLA_TRANSITIONS: Readonly<Record<UmbrellaOutcome | 'undecided', readonly UmbrellaOutcome[]>> = {
  undecided: ['news', 'ticked', 'no_box', 'ambiguous', 'gone'],
  news: [],
  ticked: [],
  no_box: [],
  ambiguous: [],
  gone: [],
};
