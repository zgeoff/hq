import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { getLanesHold } from './get-lanes-hold.ts';
import { readHeldSpans } from './read-held-spans.ts';
import { writeHeldSpans } from './write-held-spans.ts';

export function releaseLanes(db: Database, actor: string): boolean {
  return db
    .transaction(() => {
      const had = getLanesHold(db) !== null;
      setMeta(db, 'lanes_hold', null);
      if (had) {
        const spans = readHeldSpans(db);
        const until = iso(now());
        const last = spans.at(-1);
        if (last !== undefined) {
          writeHeldSpans(db, [...spans.slice(0, -1), { from: last.from, until }]);
        }
        logEvent(db, 'hq', 'lanes', 'released', actor, null, null, {});
      }
      return had;
    })
    .immediate();
}
