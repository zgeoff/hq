import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { pickReopenAdmission } from './pick-reopen-admission.ts';
import { readReopenAdmissionFacts } from './read-reopen-admission-facts.ts';
import type { ReopenDesign } from './read-reopen-admission-facts.ts';
import { setState } from './set-state.ts';
import type { RunView } from './types.ts';

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
  const admission = pickReopenAdmission(readReopenAdmissionFacts(db, issue, design));
  if (admission.kind === 'refused') {
    throw new HqError(admission.code, admission.message, admission.data);
  }
  return admission.designLane;
}
