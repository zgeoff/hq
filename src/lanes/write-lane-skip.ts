import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { ISSUE } from '../followups/issue.ts';
import { logEvent } from '../log-event.ts';
import { LANE_SKIPS_KEY, readLaneSkips } from './read-lane-skips.ts';
import type { LaneSkip } from './types.ts';

export interface SkipChange {
  issue: string;
  until: string;
  reason: string;
  actor: string;
  at: Date;
}

// Sets one issue's skip, in place of any it had, and logs it. The caller reads the clock and passes
// the set time; an until before it is refused.
export function writeLaneSkip(db: Database, change: SkipChange): LaneSkip {
  if (!ISSUE.test(change.issue)) {
    throw new HqError('bad_args', `hq lanes skip takes an issue like GEO-123, not "${change.issue.slice(0, 60)}"`);
  }
  const reason = change.reason.trim();
  if (reason === '') {
    throw new HqError('bad_args', '--reason must say why');
  }
  const skip: LaneSkip = { issue: change.issue, until: parseUntil(change.until, change.issue, change.at), reason, by: change.actor, at: iso(change.at) };
  db.transaction(() => {
    const others = readLaneSkips(db).filter((stored) => stored.issue !== skip.issue);
    const skips = [...others, skip].toSorted((left, right) => left.issue.localeCompare(right.issue));
    setMeta(db, LANE_SKIPS_KEY, JSON.stringify(skips));
    logEvent(db, 'hq', 'lanes', 'skip-set', change.actor, null, null, { issue: skip.issue, until: skip.until, reason: skip.reason });
  }).immediate();
  return skip;
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/u;

function parseUntil(until: string, issue: string, at: Date): string {
  if (ISSUE.test(until)) {
    if (until === issue) {
      throw new HqError('bad_args', `--until names ${issue} itself; give another issue or a time`);
    }
    return until;
  }
  const time = Date.parse(until);
  if (!ISO_TIME.test(until) || Number.isNaN(time)) {
    throw new HqError('bad_args', `--until takes an ISO time, such as 2026-11-02T09:00:00Z, or an issue like GEO-123, not "${until.slice(0, 60)}"`);
  }
  if (time <= at.getTime()) {
    throw new HqError('bad_args', `--until ${until} has passed; give a later time`);
  }
  return iso(new Date(time));
}
