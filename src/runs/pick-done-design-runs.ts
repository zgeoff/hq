import type { DesignRun } from '../lanes/read-design-runs.ts';

export function pickDoneDesignRuns(designRuns: readonly DesignRun[], doneIssues: ReadonlySet<string>): string[] {
  return designRuns
    .filter((run) => run.state !== 'done' && run.state !== 'dropped' && doneIssues.has(run.issue))
    .map((run) => run.issue)
    .toSorted();
}
