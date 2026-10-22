import type { Database } from 'bun:sqlite';
import { getCutoff as cutoff } from '../stats/get-cutoff.ts';
import type { SizedRun } from './types.ts';

// Finished runs (past the merge, no PR still open) whose last PR merge falls in the window,
// with their merged PRs: a run half merged would compare the whole guess with part of the work.
export function mergedRuns(db: Database, from: string, to: string): SizedRun[] {
  const lo = from < cutoff() ? cutoff() : from;
  const rows = db
    .query(
      `SELECT r.issue, r.size, r.size_lines, MAX(p.merged_at) AS lastMerge
       FROM runs r JOIN run_prs p ON p.issue = r.issue AND p.state = 'merged' AND p.merged_at IS NOT NULL
       WHERE r.created_at >= ? AND r.state IN ('merged', 'deploying', 'deploy-held', 'live-check', 'done')
         AND NOT EXISTS (SELECT 1 FROM run_prs o WHERE o.issue = r.issue AND o.state = 'open')
       GROUP BY r.issue HAVING lastMerge >= ? AND lastMerge < ? ORDER BY lastMerge`,
    )
    .all(cutoff(), lo, to) as Omit<SizedRun, 'prs'>[];
  const prs = db.query(`SELECT ref, url FROM run_prs WHERE issue = ? AND state = 'merged' ORDER BY ref`);
  return rows.map((r) => ({ ...r, prs: prs.all(r.issue) as SizedRun['prs'] }));
}
