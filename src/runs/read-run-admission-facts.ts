import type { Database } from 'bun:sqlite';
import { countOpenDesignRuns } from '../lanes/count-open-design-runs.ts';
import { DEFAULT_DESIGN_SLOTS } from '../lanes/default-design-slots.ts';
import { readDesignIssues } from '../lanes/read-design-issues.ts';
import { readDesignRuns } from '../lanes/read-design-runs.ts';
import { CLOSED_RUN_STATES as CLOSED } from '../transitions/closed-run-states.ts';
import type { RunAdmissionFacts } from './pick-run-admission.ts';
import type { AddRunInput, Run } from './types.ts';

type AdmissionInput = Pick<AddRunInput, 'issue' | 'design' | 'asked' | 'designSlots' | 'designError'>;

// The facts pickRunAdmission chooses from: the issue's type and the design runs open in each lane.
export function readRunAdmissionFacts(db: Database, input: AdmissionInput, previous: Run | null): RunAdmissionFacts {
  const designRuns = readDesignRuns(db);
  const open = designRuns.filter((run) => !CLOSED.includes(run.state));
  return {
    issue: input.issue,
    prior: previous === null ? null : { state: previous.state, designLane: previous.design_lane },
    isDesignType: readDesignIssues(db).has(input.issue),
    design: input.design ?? null,
    asked: input.asked ?? null,
    open: countOpenDesignRuns(designRuns),
    openIssues: { agent: open.filter((run) => run.lane === 'agent').map((run) => run.issue), withGeoff: open.filter((run) => run.lane === 'with-geoff').map((run) => run.issue) },
    slots: input.designSlots ?? DEFAULT_DESIGN_SLOTS,
    designError: input.designError ?? null,
  };
}
