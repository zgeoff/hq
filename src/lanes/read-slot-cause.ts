import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import { buildSlotCause } from './build-slot-cause.ts';
import { CAUSE_SINCE } from './cause-since.ts';
import { LANES } from './lanes.ts';
import { PROMOTABLE_FOCUS } from './promotable-focus.ts';
import { PROMOTABLE_FOCUS_KEY } from './promotable-focus-key.ts';
import { READY_ISSUES_KEY } from './ready-issues-key.ts';
import { READY_SNAPSHOT } from './ready-snapshot.ts';
import type { SlotPlan } from './read-slot-plan.ts';
import { CAUSE_SINCE_KEY } from './cause-since-key.ts';
import { ELIGIBLE_SINCE_KEY } from './eligible-since-key.ts';
import type { SlotCause } from './types.ts';

// The cause of the empty slots now, from the clocks the lanes tick keeps. It writes nothing, so hq
// lanes can show it between ticks.
export function readSlotCause(db: Database, slotPlan: SlotPlan | null, at: Date): SlotCause {
  const snapshot = metaJson(db, READY_ISSUES_KEY, READY_SNAPSHOT, null);
  return buildSlotCause({
    free: slotPlan?.pool.free ?? 0,
    eligible: slotPlan?.eligible ?? null,
    eligibleSince: getMeta(db, ELIGIBLE_SINCE_KEY),
    readyAt: snapshot?.at ?? null,
    promotable: metaJson(db, PROMOTABLE_FOCUS_KEY, PROMOTABLE_FOCUS, null),
    causeSince: metaJson(db, CAUSE_SINCE_KEY, CAUSE_SINCE, null),
    freshMinutes: LANES.readyFreshMinutes(),
    at,
  });
}
