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

export function checkDesignReopen(db: Database, issue: string, design: ReopenDesign): string | null {
  const admission = pickReopenAdmission(readReopenAdmissionFacts(db, issue, design));
  if (admission.kind === 'refused') {
    throw new HqError(admission.code, admission.message, admission.data);
  }
  return admission.designLane;
}
