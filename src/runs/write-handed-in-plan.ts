import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { logEvent } from '../log-event.ts';
import type { HandedInPlan } from './build-handed-in-plan.ts';
import type { WrapUp } from './types.ts';
import { updateMergedRun } from './update-merged-run.ts';
import { recordMergedWrapUp } from './wrap-up-merged-runs.ts';

export interface HandedInWrite {
  issue: string;
  wrapUp: WrapUp;
  actor: string;
  at: Date;
}

export function writeHandedInPlan(db: Database, plan: HandedInPlan, write: HandedInWrite): void {
  const end = db.query("UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?), ended_by = 'sweep' WHERE session_id = ? AND active = 1");
  db.transaction(() => {
    if (plan.kept !== null) {
      logEvent(db, 'run', write.issue, 'handed-in-kept', write.actor, null, null, plan.kept);
    }
    if (plan.end.length > 0) {
      for (const id of plan.end) {
        end.run(iso(write.at), id);
      }
      logEvent(db, 'run', write.issue, 'handed-in-ended', write.actor, null, null, { sessions: plan.end });
    }

    // The merged-run pass qualifies a run by a wrap-up event after its move to merged, so the claim
    // goes in with the move and no other pass can take the run between them.
    if (plan.tryMergedUpdate && updateMergedRun(db, write.issue, write.actor)) {
      logEvent(db, 'run', write.issue, 'merged-wrap-up', write.actor, null, null);
    }
    if (plan.report) {
      recordMergedWrapUp(db, write.issue, write.wrapUp, write.actor);
    }
  }).immediate();
}
