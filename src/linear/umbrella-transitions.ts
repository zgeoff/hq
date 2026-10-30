import type { UmbrellaOutcome } from './types.ts';

export const UMBRELLA_TRANSITIONS: Readonly<Record<UmbrellaOutcome | 'undecided', readonly UmbrellaOutcome[]>> = {
  undecided: ['news', 'ticked', 'no_box', 'ambiguous', 'gone'],
  news: [],
  ticked: [],
  no_box: [],
  ambiguous: [],
  gone: [],
};
