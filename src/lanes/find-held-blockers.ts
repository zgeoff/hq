import { isIssuePromotable } from './is-issue-promotable.ts';
import type { BacklogIssue } from './types.ts';

export interface HeldBlocker {
  identifier: string;
  lastMergedAt: string;
}

export function findHeldBlockers(issue: BacklogIssue, blockers: readonly { identifier: string; state: string }[], doneOpen: ReadonlyMap<string, string>): HeldBlocker[] | null {
  const waiting = blockers.filter((blocker) => blocker.state !== 'completed');
  const held = waiting.flatMap((blocker) => {
    const lastMergedAt = doneOpen.get(blocker.identifier);
    return lastMergedAt === undefined ? [] : [{ identifier: blocker.identifier, lastMergedAt }];
  });
  if (waiting.length === 0 || held.length !== waiting.length) {
    return null;
  }
  return isIssuePromotable({ ...issue, blockerStates: blockers.map(() => 'completed') }) ? held : null;
}
