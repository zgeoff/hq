import type { Database } from 'bun:sqlite';
import type { Runner } from '../runner/types.ts';
import { closePr } from './close-pr.ts';
import type { GitHubPr } from './parse-github-pr.ts';
import { readGitHubPR } from './read-github-pr.ts';
import { SWEEP_ACTOR } from './sweep-actor.ts';
import type { Alert } from './types.ts';

// Before the sweep flags a run PR, it asks GitHub: one closed there without a merge is marked
// closed and drops its alert. A merged PR, or one gh can't read, keeps its alert.
export async function closeFlaggedPRs(db: Database, run: Runner, alerts: Alert[]): Promise<Alert[]> {
  const kept = await Promise.all(alerts.map((alert) => closeOne(db, run, alert)));
  return alerts.filter((_, index) => kept[index]);
}

async function closeOne(db: Database, run: Runner, alert: Alert): Promise<boolean> {
  if (!alert.key.startsWith('pr:')) {
    return true;
  }
  const ref = alert.key.slice('pr:'.length);
  const pr = await readGitHubPR(run, ref);
  if (!isClosedUnmerged(pr)) {
    return true;
  }

  // Someone closed it by hand while gh was asked: their word stands.
  if (db.query('SELECT 1 FROM run_prs WHERE ref = ? AND state = ?').get(ref, 'open') === null) {
    return false;
  }
  closePr(db, ref, { to: 'closed', actor: SWEEP_ACTOR });
  return false;
}

function isClosedUnmerged(pr: GitHubPr | { error: string }): boolean {
  return 'state' in pr && pr.state === 'CLOSED';
}
