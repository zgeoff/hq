import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { CAUSE_SINCE } from './cause-since.ts';
import { CAUSE_SINCE_KEY } from './cause-since-key.ts';
import { SLOT_CAUSE_TRANSITIONS } from './slot-cause-transitions.ts';
import type { SlotCauseAction, SlotCauseState } from './slot-cause-transitions.ts';

// The one write to the stored cause: checks the move from the stored cause to `to` against the
// table, then stores `to` as beginning at `at`, or clears it for none.
export function writeSlotCauseMove(db: Database, action: SlotCauseAction, to: SlotCauseState, at: Date): void {
  const from: SlotCauseState = metaJson(db, CAUSE_SINCE_KEY, CAUSE_SINCE, null)?.cause ?? 'none';
  const row = SLOT_CAUSE_TRANSITIONS[action];
  const allowed: readonly SlotCauseState[] = row.from;
  if (!allowed.includes(from)) {
    throw new HqError('bad_state', `the slot cause is ${from}: ${action} needs ${allowed.join(' or ')}`, { state: from });
  }
  const targets: readonly SlotCauseState[] = typeof row.to === 'string' ? [row.to] : row.to;
  if (!targets.includes(to)) {
    throw new HqError('bad_state', `the slot cause is ${from}: ${action} cannot go to ${to}`, { state: from });
  }
  const record = to === 'none' ? null : JSON.stringify({ cause: to, since: iso(at) });
  setMeta(db, CAUSE_SINCE_KEY, record);
}
