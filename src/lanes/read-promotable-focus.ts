import type { Database } from 'bun:sqlite';
import { countFocusMatches } from '../focus/count-focus-matches.ts';
import { readFocus } from '../focus/read-focus.ts';
import type { LinearCall } from '../linear/types.ts';
import { readPromotableIssues } from './read-promotable-issues.ts';
import { writePromotableFocus } from './write-promotable-focus.ts';

// Counts the Backlog issues triage may promote that the focus asks for, and keeps the count with its
// time. A failed read keeps an unknown count (null) with its time and throws nothing.
export async function readPromotableFocus(db: Database, call: LinearCall, team: string): Promise<void> {
  let count: number | null = null;
  try {
    const issues = await readPromotableIssues(call, team);
    count = countFocusMatches(
      issues.map((issue) => issue.facts),
      readFocus(db),
    );
  } catch {
    count = null;
  }
  writePromotableFocus(db, count);
}
