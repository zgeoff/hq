import type { Database } from 'bun:sqlite';
import { setState } from './set-state.ts';

// The PR's merge and its session's end come in either order, so each calls this.
export function updateMergedRun(db: Database, issue: string, actor: string): boolean {
  const run = db
    .query(
      `SELECT r.state,
         (SELECT COUNT(*) FROM run_prs p WHERE p.issue = r.issue AND p.state = 'merged' AND p.design_pass = 0) AS merged,
         (SELECT COUNT(*) FROM run_prs p WHERE p.issue = r.issue AND p.state = 'open' AND p.design_pass = 0) AS open,
         (SELECT COUNT(*) FROM run_sessions s WHERE s.issue = r.issue AND s.active = 1) AS active
       FROM runs r WHERE r.issue = ?`,
    )
    .get(issue) as { state: string; merged: number; open: number; active: number } | null;
  if (run === null || run.state !== 'working' || run.merged === 0 || run.open > 0 || run.active > 0) {
    return false;
  }
  setState(db, issue, 'merged', {}, actor);
  return true;
}
