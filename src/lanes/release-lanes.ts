import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { getLanesHold } from './get-lanes-hold.ts';
import { LANES_HELD_SPAN } from './lanes-held-span.ts';
import { readHeldSpan } from './read-held-span.ts';

export function releaseLanes(db: Database, actor: string): boolean {
  return db
    .transaction(() => {
      const had = getLanesHold(db) !== null;
      setMeta(db, 'lanes_hold', null);
      if (had) {
        const span = readHeldSpan(db);
        if (span !== null) {
          const until = iso(now());
          setMeta(db, LANES_HELD_SPAN, JSON.stringify({ from: span.from, until }));
        }
        logEvent(db, 'hq', 'lanes', 'released', actor, null, null, {});
      }
      return had;
    })
    .immediate();
}
