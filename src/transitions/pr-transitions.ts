import type { PRState } from './pr-states.ts';
import type { Row } from './types.ts';

export const PR_TRANSITIONS = {
  add: { from: [], to: 'open' },
  final: { from: ['open'], to: 'same' },
  unfinal: { from: ['open'], to: 'same' },
  merged: { from: ['open'], to: 'merged' },
  closed: { from: ['open'], to: 'closed' },
  unmerge: { from: ['merged'], to: 'open' },
} as const satisfies Record<string, Row<PRState>>;
export type PRAction = keyof typeof PR_TRANSITIONS;
