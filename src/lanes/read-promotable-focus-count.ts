import type { Database } from 'bun:sqlite';
import { countFocusMatches } from '../focus/count-focus-matches.ts';
import { readFocus } from '../focus/read-focus.ts';
import type { LinearCall } from '../linear/types.ts';
import { readPromotableIssues } from './read-promotable-issues.ts';

// The Backlog issues triage may promote that the focus asks for.
export async function readPromotableFocusCount(db: Database, call: LinearCall, team: string): Promise<number> {
  const issues = await readPromotableIssues(call, team);
  return countFocusMatches(
    issues.map((issue) => issue.facts),
    readFocus(db),
  );
}
