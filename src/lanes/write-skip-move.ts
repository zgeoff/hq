import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { LANE_SKIPS_KEY, readLaneSkips } from './read-lane-skips.ts';
import { SKIP_TRANSITIONS } from './skip-transitions.ts';
import type { SkipAction, SkipState } from './skip-transitions.ts';
import type { LaneSkip } from './types.ts';

// The one write to the stored skips: checks the move against the table, stores the skips after it in
// issue order, and logs it. The caller holds the transaction.
export function writeSkipMove(db: Database, action: SkipAction, skip: LaneSkip, actor: string): void {
  const skips = readLaneSkips(db);
  const others = skips.filter((stored) => stored.issue !== skip.issue);
  const from: SkipState = others.length === skips.length ? 'none' : 'active';
  const row = SKIP_TRANSITIONS[action];
  const allowed: readonly SkipState[] = row.from;
  if (!allowed.includes(from)) {
    const held = from === 'none' ? 'no skip' : 'a skip';
    throw new HqError('bad_state', `${skip.issue} has ${held}, so ${action} cannot apply`, { state: from });
  }
  const kept = row.to === 'active' ? [...others, skip].toSorted((left, right) => left.issue.localeCompare(right.issue)) : others;
  setMeta(db, LANE_SKIPS_KEY, JSON.stringify(kept));
  logEvent(db, 'hq', 'lanes', action, actor, from, row.to, { issue: skip.issue, until: skip.until, reason: skip.reason });
}
