import type { Row } from './transitions/types.ts';
import type { UnblockState } from './unblock-state.ts';

export const UNBLOCK_TRANSITIONS = {
  added: { from: [], to: 'open' },
  updated: { from: ['open'], to: 'same' },

  'done-when': { from: ['open'], to: 'same' },

  reopened: { from: ['done', 'dropped'], to: 'open' },
  done: { from: ['open'], to: 'done' },
  dropped: { from: ['open'], to: 'dropped' },
} as const satisfies Record<string, Row<UnblockState>>;

export type UnblockAction = keyof typeof UNBLOCK_TRANSITIONS;
