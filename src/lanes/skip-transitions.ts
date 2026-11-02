import type { Row } from '../transitions/types.ts';

export type SkipState = 'none' | 'active';

export const SKIP_TRANSITIONS = {
  'skip-set': { from: ['none', 'active'], to: 'active' },
  'skip-dropped': { from: ['active'], to: 'none' },

  'skip-ended': { from: ['active'], to: 'none' },
} as const satisfies Record<string, Row<SkipState>>;

export type SkipAction = keyof typeof SKIP_TRANSITIONS;
