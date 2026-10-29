import type { Database } from 'bun:sqlite';
import { DEFAULT_DESIGN_SLOTS } from '../lanes/default-design-slots.ts';
import { readDesignRuns } from '../lanes/read-design-runs.ts';
import type { DesignSlots } from '../lanes/types.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { pickRunAdmission } from './pick-run-admission.ts';
import { readRunAdmissionFacts } from './read-run-admission-facts.ts';
import { CLOSED_RUN_STATES as CLOSED } from '../transitions/closed-run-states.ts';
import { getRun } from './get-run.ts';
import { setState } from './set-state.ts';
import type { RunView } from './types.ts';

// The design lane counts a reopened design pass is held to, and where the owner asked for a with-geoff
// pass above its count; slots left out are the defaults.
export interface ReopenDesign {
  slots?: DesignSlots;
  error: string | null;
  asked: string | null;
}

export interface ReopenRunInput {
  issue: string;
  next: string;
  design: ReopenDesign;
  actor: string;
}

// A done or dropped run back to working. A design pass takes a design lane again, so it meets the lane
// counts as hq run add does, and where the owner asked for it above them goes in a design-asked event.
export function reopenRun(db: Database, input: ReopenRunInput): RunView {
  return db
    .transaction(() => {
      const lane = checkDesignReopen(db, input.issue, input.design);
      const run = setState(db, input.issue, 'working', { next: input.next, reopen: true }, input.actor);
      if (lane !== null && input.design.asked !== null) {
        logEvent(db, 'run', input.issue, 'design-asked', input.actor, null, null, { designLane: lane, asked: input.design.asked });
      }
      return run;
    })
    .immediate();
}

// Refuses the reopen of a closed design pass above its lane count, and --asked on any other run; gives
// the pass's design lane, or null for a delivery run or a run that is not closed.
export function checkDesignReopen(db: Database, issue: string, design: ReopenDesign): string | null {
  const closed = getRun(db, issue);
  if (closed === null || !CLOSED.includes(closed.state)) {
    return null;
  }
  const lane = readDesignRuns(db).find((run) => run.issue === issue)?.lane ?? null;
  if (lane === null && design.asked !== null) {
    throw new HqError('bad_args', `--asked goes with reopening a with-geoff design pass, and ${issue} is a delivery run`);
  }
  if (lane === null) {
    return null;
  }
  const admission = pickRunAdmission(readRunAdmissionFacts(db, { issue, design: lane, asked: design.asked, designSlots: design.slots ?? DEFAULT_DESIGN_SLOTS, designError: design.error }, null));
  if (admission.kind === 'refused') {
    throw new HqError(admission.code, admission.message, admission.data);
  }
  return lane;
}
