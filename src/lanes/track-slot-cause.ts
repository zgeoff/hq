import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { CAUSE_SINCE } from './cause-since.ts';
import { readSlotCause } from './read-slot-cause.ts';
import type { SlotPlan } from './read-slot-plan.ts';
import { CAUSE_SINCE_KEY } from './cause-since-key.ts';
import { ELIGIBLE_SINCE_KEY } from './eligible-since-key.ts';
import type { SlotCause } from './types.ts';

// One look at the empty slots: starts the clock when a free slot meets eligible Ready work, clears it
// only when free slots or eligible Ready work are known to be 0, and leaves it while either is
// unknown. Then it tags the slots with their cause and keeps when that cause began, which an unknown
// capacity leaves as it was.
export function trackSlotCause(db: Database, slotPlan: SlotPlan | null, at: Date): SlotCause {
  if (slotPlan !== null && (slotPlan.pool.free === 0 || slotPlan.eligible === 0)) {
    setMeta(db, ELIGIBLE_SINCE_KEY, null);
  } else if (slotPlan !== null && slotPlan.eligible !== null && getMeta(db, ELIGIBLE_SINCE_KEY) === null) {
    setMeta(db, ELIGIBLE_SINCE_KEY, iso(at));
  }
  const slotCause = readSlotCause(db, slotPlan, at);
  if (slotPlan === null) {
    return slotCause;
  }
  if (slotCause.cause === null) {
    setMeta(db, CAUSE_SINCE_KEY, null);
    return slotCause;
  }
  const kept = metaJson(db, CAUSE_SINCE_KEY, CAUSE_SINCE, null);
  if (kept?.cause === slotCause.cause) {
    return slotCause;
  }
  setMeta(db, CAUSE_SINCE_KEY, JSON.stringify({ cause: slotCause.cause, since: iso(at) }));
  return { ...slotCause, since: iso(at) };
}
