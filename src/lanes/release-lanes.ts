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
      const spans = readHeldSpans(db);
      setMeta(db, 'lanes_hold', null);
      const last = spans.at(-1);

      // Save the spans even with no hold in force: an older build's span lives only in the hold row
      // this release clears.
      const kept = had && last !== undefined ? [...spans.slice(0, -1), { from: last.from, until: iso(now()) }] : spans;
      writeHeldSpans(db, kept);
      if (had) {
        logEvent(db, 'hq', 'lanes', 'released', actor, null, null, {});
      }
      return had;
    })
    .immediate();
}
