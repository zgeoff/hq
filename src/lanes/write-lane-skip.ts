import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import { ISSUE } from '../followups/issue.ts';
import type { LaneSkip } from './types.ts';
import { parsePRUntil } from './pr-until.ts';
import { writeSkipMove } from './write-skip-move.ts';

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
  db.transaction(() => writeSkipMove(db, 'skip-set', skip, change.actor)).immediate();
  return skip;
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/u;

function parseUntil(until: string, issue: string, at: Date): string {
  if (ISSUE.test(until)) {
    if (until === issue) {
      throw new HqError('bad_args', `--until names ${issue} itself; give another issue, a PR or a time`);
    }
    return until;
  }
  const pr = parsePRUntil(until);
  if (pr) {
    if (pr.owner !== null && pr.owner !== 'zgeoff') {
      throw new HqError('bad_args', `--until pr:${pr.owner}/... is refused: hq reads only zgeoff PRs`);
    }
    return `pr:${pr.ref}`;
  }
  const time = Date.parse(until);
  if (!ISO_TIME.test(until) || Number.isNaN(time)) {
    throw new HqError('bad_args', `--until takes an ISO time, such as 2026-11-02T09:00:00Z, an issue like GEO-123, or a PR like pr:repo#12, not "${until.slice(0, 60)}"`);
  }
  if (time <= at.getTime()) {
    throw new HqError('bad_args', `--until ${until} has passed; give a later time`);
  }
  return iso(new Date(time));
}
