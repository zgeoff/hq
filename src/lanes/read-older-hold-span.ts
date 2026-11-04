import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import type { HeldSpan } from './types.ts';

const HOLD_SCHEMA = z.object({ until: z.string() }).nullable();
const HELD_AT_SCHEMA = z.object({ at: z.string() }).nullable();

// A build before held spans saved only `lanes_hold`. The hold's start is its latest `held` event,
// and the stored row outlives the hold's end, so its whole span can still be read.
export function readOlderHoldSpan(db: Database): HeldSpan[] {
  const hold = metaJson(db, 'lanes_hold', HOLD_SCHEMA, null);
  if (hold === null) {
    return [];
  }
  const held = HELD_AT_SCHEMA.parse(db.query("SELECT at FROM events WHERE subject = 'hq' AND subject_id = 'lanes' AND action = 'held' ORDER BY seq DESC LIMIT 1").get());
  return [{ from: held?.at ?? hold.until, until: hold.until }];
}
