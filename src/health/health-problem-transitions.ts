import type { Row } from '../transitions/types.ts';

export type HealthProblemState = 'none' | 'reported' | 'asked' | 'escalated';

export const HEALTH_PROBLEM_TRANSITIONS = {
  reported: { from: ['none'], to: 'reported' },
  asked: { from: ['none'], to: 'asked' },
  escalated: { from: ['asked'], to: 'escalated' },
  cleared: { from: ['reported', 'asked', 'escalated'], to: 'none' },
} as const satisfies Record<string, Row<HealthProblemState>>;

export type HealthProblemAction = keyof typeof HEALTH_PROBLEM_TRANSITIONS;
