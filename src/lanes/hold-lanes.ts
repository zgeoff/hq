import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { getLanesHold } from './get-lanes-hold.ts';
import { LANES_HELD_SPAN } from './lanes-held-span.ts';
import { logEvent } from '../log-event.ts';
import { MAX_HOLD_MINUTES } from './max-hold-minutes.ts';
import { readHeldSpan } from './read-held-span.ts';
import { removeLaneNudges } from './remove-lane-nudges.ts';
import type { LanesHold } from './types.ts';

export function holdLanes(db: Database, minutes: number, reason: string, actor: string): LanesHold {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_HOLD_MINUTES) throw new HqError('bad_args', `--minutes must be 1 to ${MAX_HOLD_MINUTES}`);
  if (!reason.trim()) throw new HqError('bad_args', '--reason must say why');
  return db
    .transaction(() => {
      const h = { until: iso(new Date(now().getTime() + minutes * 60_000)), reason: reason.trim(), by: actor };
      const from = getLanesHold(db) === null ? iso(now()) : (readHeldSpan(db)?.from ?? iso(now()));
      setMeta(db, 'lanes_hold', JSON.stringify(h));
      setMeta(db, LANES_HELD_SPAN, JSON.stringify({ from, until: h.until }));
      removeLaneNudges(db);
      logEvent(db, 'hq', 'lanes', 'held', actor, null, null, { ...h, minutes });
      return h;
    })
    .immediate();
}
