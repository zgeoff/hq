import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { getLanesHold } from './get-lanes-hold.ts';

export function releaseLanes(db: Database, actor: string): boolean {
  return db
    .transaction(() => {
      const had = getLanesHold(db) !== null;
      setMeta(db, 'lanes_hold', null);
      if (had) logEvent(db, 'hq', 'lanes', 'released', actor, null, null, {});
      return had;
    })
    .immediate();
}
