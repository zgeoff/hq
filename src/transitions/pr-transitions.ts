import type { PrState } from './pr-states.ts';
import type { Row } from './types.ts';

export const PR_TRANSITIONS = {
  add: { from: [], to: 'open' }, // a new row: it has no earlier state
  final: { from: ['open'], to: 'same' },
  unfinal: { from: ['open'], to: 'same' },
  merged: { from: ['open'], to: 'merged' },
  closed: { from: ['open'], to: 'closed' },
  unmerge: { from: ['merged'], to: 'open' },
} as const satisfies Record<string, Row<PrState>>;
export type PrAction = keyof typeof PR_TRANSITIONS;
