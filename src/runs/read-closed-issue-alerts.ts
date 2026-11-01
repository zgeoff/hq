import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { listRuns } from './list-runs.ts';
import type { Alert, RunView } from './types.ts';

const LINEAR_STATE = z.object({ state: z.enum(['completed', 'canceled', 'open']) }).nullable();

// Open runs whose Linear issue is closed, with what to do. A 'Fixes' merge closes the issue before
// the release, deploy and live check, so a merged run still on its way to live raises nothing: the
// release pass closes it once its PRs ship, and the live check's recipient closes a live-check run.
export function readClosedIssueAlerts(db: Database): Alert[] {
  const alerts: Alert[] = [];
  for (const run of listRuns(db)) {
    const linear = LINEAR_STATE.parse(
      db.query('SELECT state FROM linear_issues WHERE issue = ?').get(run.issue),
    );
    if (!linear || linear.state === 'open') {
      continue;
    }
    const action = pickAction(run, linear.state);
    if (action === null) {
      continue;
    }
    alerts.push({
      key: `linear:${run.issue}`,
      fingerprint: `${linear.state}:${run.state}`,
      issue: run.issue,
      line: `${run.issue}: ${linear.state === 'canceled' ? 'Canceled' : 'Done'} in Linear while hq has it ${run.state}; ${action}`,
    });
  }
  return alerts;
}

function pickAction(run: RunView, linear: 'completed' | 'canceled'): string | null {
  // A design pass's PRs are no part of the build run, as the drop and merge passes read them.
  const delivery = run.prs.filter((pr) => pr.design_pass === 0);
  const merged = delivery.some((pr) => pr.state === 'merged');
  if (delivery.some((pr) => pr.state === 'open')) {
    return 'a PR is still open, so look before you close the run';
  }

  // With no merged PR, the watcher drops a canceled run itself; this covers the pass before it does.
  if (linear === 'canceled') {
    return merged
      ? `canceled after a merge: hq run drop ${run.issue}, or reopen the issue`
      : `hq run drop ${run.issue}`;
  }
  if (!merged) {
    return `done with no merged PR: hq run done ${run.issue} or hq run drop ${run.issue}`;
  }

  // A run blocked on the owner stays open past its merge on purpose, such as for a follow-up PR a
  // live session holds until he answers, so setting it merged would drop that session from the sweep.
  if (run.state === 'blocked' && run.waits_on_geoff === 1) {
    return null;
  }
  if (run.state === 'working' || run.state === 'blocked') {
    return `its PRs merged: hq run state ${run.issue} merged, and the release pass closes it once they ship`;
  }
  return null;
}
