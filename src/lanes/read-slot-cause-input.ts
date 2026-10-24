import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import { buildFocusKey } from '../focus/build-focus-key.ts';
import { readFocus } from '../focus/read-focus.ts';
import type { SlotCauseInput } from './build-slot-cause.ts';
import { CAUSE_SINCE } from './cause-since.ts';
import { CAUSE_SINCE_KEY } from './cause-since-key.ts';
import { ELIGIBLE_SINCE_KEY } from './eligible-since-key.ts';
import { LANES } from './lanes.ts';
import { PROMOTABLE_FOCUS } from './promotable-focus.ts';
import { PROMOTABLE_FOCUS_KEY } from './promotable-focus-key.ts';
import type { SlotPlan } from './read-slot-plan.ts';
import { READY_ISSUES_KEY } from './ready-issues-key.ts';
import { READY_SNAPSHOT } from './ready-snapshot.ts';

export function readSlotCauseInput(db: Database, slotPlan: SlotPlan | null, at: Date): SlotCauseInput {
  const snapshot = metaJson(db, READY_ISSUES_KEY, READY_SNAPSHOT, null);
  return {
    free: slotPlan?.pool.free ?? 0,
    eligible: slotPlan?.eligible ?? null,
    eligibleSince: getMeta(db, ELIGIBLE_SINCE_KEY),
    readyAt: snapshot?.at ?? null,
    promotable: metaJson(db, PROMOTABLE_FOCUS_KEY, PROMOTABLE_FOCUS, null),
    focus: buildFocusKey(readFocus(db)),
    causeSince: metaJson(db, CAUSE_SINCE_KEY, CAUSE_SINCE, null),
    freshMinutes: LANES.readyFreshMinutes(),
    at,
  };
}
