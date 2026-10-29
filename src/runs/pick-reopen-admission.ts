import type { OpenDesignRuns } from '../lanes/count-open-design-runs.ts';
import type { DesignLane } from '../lanes/design-lane.ts';
import type { DesignSlots } from '../lanes/types.ts';
import { pickRunAdmission } from './pick-run-admission.ts';
import type { RunAdmission } from './pick-run-admission.ts';

export interface ReopenAdmissionFacts {
  issue: string;

  // Done or dropped: a run still open takes no lane again.
  closed: boolean;

  // The design lane the run's pass fills, or null for a delivery run.
  lane: DesignLane | null;
  asked: string | null;
  open: OpenDesignRuns;

  // The issues of the open design passes in each lane, for the refusal text.
  openIssues: { agent: string[]; withGeoff: string[] };
  slots: DesignSlots;
  designError: string | null;
}

export type ReopenAdmission = { kind: 'reopen'; designLane: DesignLane | null } | Extract<RunAdmission, { kind: 'refused' }>;

// A closed design pass takes its design lane again, so it meets the lane counts as a new pass does.
// --asked goes with a design pass only; a delivery run or a run still open takes no design lane.
export function pickReopenAdmission(facts: ReopenAdmissionFacts): ReopenAdmission {
  if (!facts.closed) {
    return { kind: 'reopen', designLane: null };
  }
  if (facts.lane === null && facts.asked !== null) {
    return { kind: 'refused', code: 'bad_args', message: `--asked goes with reopening a with-geoff design pass, and ${facts.issue} is a delivery run` };
  }
  if (facts.lane === null) {
    return { kind: 'reopen', designLane: null };
  }
  const admission = pickRunAdmission({ issue: facts.issue, prior: null, isDesignType: false, design: facts.lane, asked: facts.asked, open: facts.open, openIssues: facts.openIssues, slots: facts.slots, designError: facts.designError });
  return admission.kind === 'refused' ? admission : { kind: 'reopen', designLane: facts.lane };
}
