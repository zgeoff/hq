import { CLOSED_RUN_STATES } from './closed-run-states.ts';
import type { RunState } from './run-states.ts';
import { RUN_STATES } from './run-states.ts';
import type { Row } from './types.ts';

const OPEN_RUN_STATES: readonly RunState[] = RUN_STATES.filter((s) => !CLOSED_RUN_STATES.includes(s));

export const RUN_TRANSITIONS = {
  // an open run goes to any state, its own included
  state: { from: OPEN_RUN_STATES, to: RUN_STATES },
  // a closed run needs --reopen, then goes to any state, closed ones included
  reopen: { from: CLOSED_RUN_STATES, to: RUN_STATES },
} as const satisfies Record<string, Row<RunState>>;
export type RunAction = keyof typeof RUN_TRANSITIONS;
