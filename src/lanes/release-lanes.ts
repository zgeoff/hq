import type { Database } from 'bun:sqlite';
import { z } from 'zod';
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
        const from = spans.at(-1)?.from ?? readLastLookAt(db) ?? until;
        writeHeldSpans(db, [...spans.slice(0, -1), { from, until }]);
        logEvent(db, 'hq', 'lanes', 'released', actor, null, null, {});
      }
      return had;
    })
    .immediate();
}

// A hold saved before spans existed has none: it counts as held from the last look, since every
// minute before that look is already counted.
function readLastLookAt(db: Database): string | null {
  return z.object({ at: z.string() }).nullable().parse(db.query('SELECT at FROM lanes_samples ORDER BY seq DESC LIMIT 1').get())?.at ?? null;
}
