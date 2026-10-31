import type { Row } from '../transitions/types.ts';

// A health problem's state, as its health_open entry stores it: none (no entry), reported to the
// owner's session, asked of the session that owns it, or escalated after that session left it open.
export type HealthProblemState = 'none' | 'reported' | 'asked' | 'escalated';

// The moves a health problem makes, named as pickHealthMoves names them. Every write to health_open
// goes through checkHealthProblem, so a move this table lacks cannot happen.
export const HEALTH_PROBLEM_TRANSITIONS = {
  reported: { from: ['none'], to: 'reported' },
  asked: { from: ['none'], to: 'asked' },
  escalated: { from: ['asked'], to: 'escalated' },
  cleared: { from: ['reported', 'asked', 'escalated'], to: 'none' },
} as const satisfies Record<string, Row<HealthProblemState>>;

export type HealthProblemAction = keyof typeof HEALTH_PROBLEM_TRANSITIONS;
