import { countFocusMatches } from '../focus/count-focus-matches.ts';
import type { Focus } from '../focus/types.ts';
import type { LinearCall } from '../linear/types.ts';
import { readPromotableIssues } from './read-promotable-issues.ts';

// The Backlog issues triage may promote that the given focus asks for.
export async function readPromotableFocusCount(call: LinearCall, team: string, focus: Focus | null): Promise<number> {
  const issues = await readPromotableIssues(call, team);
  return countFocusMatches(
    issues.map((issue) => issue.facts),
    focus,
  );
}
