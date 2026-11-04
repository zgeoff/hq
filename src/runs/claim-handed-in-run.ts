import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { readEvents } from '../read-events.ts';
import { CLEANUP_ACTIONS, isCleanupHeld } from './is-cleanup-held.ts';
import { writeMergedClaim } from './wrap-up-merged-runs.ts';

export interface HandedInClaim {
  mergedClaimed: boolean;
}

// The hq-lanes watcher and hq run tidy sweep at the same time, so a run whose cleanup another pass
// holds is skipped. A run the merged-run pass would take is claimed for it too, so that pass skips it.
export function claimHandedInRun(db: Database, issue: string, actor: string, at: Date): HandedInClaim | null {
  return db
    .transaction(() => {
      if (isCleanupHeld(readEvents(db, 'run', issue, CLEANUP_ACTIONS), at)) {
        return null;
      }
      const mergedClaimed = writeMergedClaim(db, issue, actor);
      logEvent(db, 'run', issue, 'handed-in-claim', actor, null, null);
      return { mergedClaimed };
    })
    .immediate();
}
