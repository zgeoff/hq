import type { Database } from 'bun:sqlite';
import { DEFAULT_DESIGN_SLOTS } from '../lanes/default-design-slots.ts';
import { readDesignRuns } from '../lanes/read-design-runs.ts';
import type { DesignSlots } from '../lanes/types.ts';
import { CLOSED_RUN_STATES as CLOSED } from '../transitions/closed-run-states.ts';
import { getRun } from './get-run.ts';
import type { ReopenAdmissionFacts } from './pick-reopen-admission.ts';
import { readRunAdmissionFacts } from './read-run-admission-facts.ts';

// The design lane counts a reopened design pass is held to, and where the owner asked for a with-geoff
// pass above its count; slots left out are the defaults.
export interface ReopenDesign {
  slots?: DesignSlots;
  error: string | null;
  asked: string | null;
}

// The facts pickReopenAdmission chooses from: whether the run is closed, its pass's design lane, and the
// design runs open in each lane.
export function readReopenAdmissionFacts(db: Database, issue: string, design: ReopenDesign): ReopenAdmissionFacts {
  const run = getRun(db, issue);
  const lanes = readRunAdmissionFacts(db, { issue, design: null, asked: design.asked, designSlots: design.slots ?? DEFAULT_DESIGN_SLOTS, designError: design.error }, null);
  return {
    issue,
    closed: run !== null && CLOSED.includes(run.state),
    lane: readDesignRuns(db).find((designRun) => designRun.issue === issue)?.lane ?? null,
    asked: lanes.asked,
    open: lanes.open,
    openIssues: lanes.openIssues,
    slots: lanes.slots,
    designError: lanes.designError,
  };
}
