import type { Row } from '../transitions/types.ts';

export type LowWaterState = 'none' | 'open';

export const LOW_WATER_TRANSITIONS = {
  started: { from: ['none'], to: 'open' },
  ended: { from: ['open'], to: 'none' },
} as const satisfies Record<string, Row<LowWaterState>>;

export type LowWaterAction = keyof typeof LOW_WATER_TRANSITIONS;
