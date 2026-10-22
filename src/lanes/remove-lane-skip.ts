import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { LANE_SKIPS_KEY, readLaneSkips } from './read-lane-skips.ts';

// Drops one issue's skip and logs it; false when the issue had none, and then nothing is logged.
export function removeLaneSkip(db: Database, issue: string, actor: string): boolean {
  return db
    .transaction(() => {
      const skips = readLaneSkips(db);
      const kept = skips.filter((skip) => skip.issue !== issue);
      if (kept.length === skips.length) {
        return false;
      }
      setMeta(db, LANE_SKIPS_KEY, kept.length === 0 ? null : JSON.stringify(kept));
      logEvent(db, 'hq', 'lanes', 'skip-dropped', actor, null, null, { issue });
      return true;
    })
    .immediate();
}
