import { CLOSED_RUN_STATES } from './closed-run-states.ts';
import type { RunState } from './run-states.ts';
import { RUN_STATES } from './run-states.ts';
import type { Row } from './types.ts';

const OPEN_RUN_STATES: readonly RunState[] = RUN_STATES.filter((s) => !CLOSED_RUN_STATES.includes(s));

export const RUN_TRANSITIONS = {
  state: { from: OPEN_RUN_STATES, to: RUN_STATES },
  reopen: { from: CLOSED_RUN_STATES, to: RUN_STATES },
  'design-to-build': { from: CLOSED_RUN_STATES, to: 'working' },
} as const satisfies Record<string, Row<RunState>>;
export type RunAction = keyof typeof RUN_TRANSITIONS;
