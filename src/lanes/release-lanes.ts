import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { getLanesHold } from './get-lanes-hold.ts';
import { LANES_MINUTES_FROM } from './lanes-minutes-from.ts';

export function releaseLanes(db: Database, actor: string): boolean {
  return db
    .transaction(() => {
      const had = getLanesHold(db) !== null;
      setMeta(db, 'lanes_hold', null);
      if (had) {
        setMeta(db, LANES_MINUTES_FROM, iso(now()));
        logEvent(db, 'hq', 'lanes', 'released', actor, null, null, {});
      }
      return had;
    })
    .immediate();
}
