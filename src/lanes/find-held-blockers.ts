import { isIssuePromotable } from './is-issue-promotable.ts';
import type { BacklogIssue } from './types.ts';

export interface HeldBlocker {
  identifier: string;
  lastMergedAt: string;
}

// The blockers that alone hold back an otherwise promotable Backlog issue: each is In Progress with every
// PR merged (a key of doneOpen, valued with its last merge). Null when the issue is promotable already, or
// fails for another reason, or has a blocker that is neither completed nor done-but-open.
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
