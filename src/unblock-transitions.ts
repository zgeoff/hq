import type { Row } from './transitions/types.ts';
import type { UnblockState } from './unblock-state.ts';

// The moves an unblock item makes, named as their events are. Every write to `unblocks.state` goes
// through checkUnblock, so a move this table lacks cannot happen.
export const UNBLOCK_TRANSITIONS = {
  // a new row, which has no earlier state
  added: { from: [], to: 'open' },
  updated: { from: ['open'], to: 'same' },

  // addDoneWhen, conditions added to an open item
  'done-when': { from: ['open'], to: 'same' },

  // addUnblock, the same id filed again after the owner closed it
  reopened: { from: ['done', 'dropped'], to: 'open' },
  done: { from: ['open'], to: 'done' },
  dropped: { from: ['open'], to: 'dropped' },
} as const satisfies Record<string, Row<UnblockState>>;

export type UnblockAction = keyof typeof UNBLOCK_TRANSITIONS;
