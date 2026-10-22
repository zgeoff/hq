import type { Row } from '../transitions/types.ts';

// An issue has a skip stored or none; a stored skip past its time stays active here until the Ready
// tick ends it.
export type SkipState = 'none' | 'active';

// The moves a lane skip makes, named as their events are. Every write to the stored skips checks its
// move against this table, so a move the table lacks cannot happen.
export const SKIP_TRANSITIONS = {
  // a new skip, or one in place of the issue's earlier skip
  'skip-set': { from: ['none', 'active'], to: 'active' },
  'skip-dropped': { from: ['active'], to: 'none' },

  // the Ready tick, once the time passed or the until issue is Done or Canceled
  'skip-ended': { from: ['active'], to: 'none' },
} as const satisfies Record<string, Row<SkipState>>;

export type SkipAction = keyof typeof SKIP_TRANSITIONS;
