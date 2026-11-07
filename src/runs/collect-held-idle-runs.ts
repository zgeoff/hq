import type { StoredEvent } from '../read-events.ts';
import { isScopeHeld } from './is-scope-held.ts';

export interface WorkingRunRead {
  issue: string;
  waitsOn: string | null;
  newestScopeEvent: StoredEvent | undefined;
}

// A held run with no active session never becomes a hand-in candidate, so it needs its own Scope
// check to be released.
export function collectHeldIdleRuns(runs: readonly WorkingRunRead[], activeIssues: ReadonlySet<string>): string[] {
  return runs.filter((run) => !activeIssues.has(run.issue) && isScopeHeld(run.waitsOn, run.newestScopeEvent)).map((run) => run.issue);
}
