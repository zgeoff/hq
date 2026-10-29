import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';
import type { DesignRun } from './read-design-runs.ts';

export interface OpenDesignRuns {
  agent: number;
  withGeoff: number;
}

// The design passes with an open run in each lane.
export function countOpenDesignRuns(designRuns: readonly DesignRun[]): OpenDesignRuns {
  const open = designRuns.filter((run) => !CLOSED_RUN_STATES.includes(run.state));
  return { agent: open.filter((run) => run.lane === 'agent').length, withGeoff: open.filter((run) => run.lane === 'with-geoff').length };
}
