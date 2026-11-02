import type { Row } from '../transitions/types.ts';

// A low-water episode's state, as meta `lanes_low_water_since` stores it: none (unset) or open (set to
// the look that started it).
export type LowWaterState = 'none' | 'open';

// The moves an episode makes, named as pickLowWaterMoves names them. Every write to the meta key goes
// through checkLowWater, so a move this table lacks cannot happen.
export const LOW_WATER_TRANSITIONS = {
  started: { from: ['none'], to: 'open' },
  ended: { from: ['open'], to: 'none' },
} as const satisfies Record<string, Row<LowWaterState>>;

export type LowWaterAction = keyof typeof LOW_WATER_TRANSITIONS;
