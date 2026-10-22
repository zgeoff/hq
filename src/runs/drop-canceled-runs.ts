import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { setState } from './set-state.ts';

const ISSUES = z.array(z.object({ issue: z.string() }));

// The one run state Linear decides alone: an issue canceled while its run has no open or merged PR,
// seen by a full GitHub pass that ran after the cancellation, so a PR opened just before it counts.
export function dropCanceledRuns(db: Database, actor: string, githubAt: string | null): string[] {
  if (githubAt === null) {
    return [];
  }
  return db
    .transaction(() => {
      const issues = ISSUES.parse(
        db
          .query(
            `SELECT r.issue FROM runs r JOIN linear_issues l ON l.issue = r.issue
             WHERE r.state NOT IN ('done', 'dropped') AND l.state = 'canceled' AND l.closed_at < ?
               AND NOT EXISTS (SELECT 1 FROM run_prs p WHERE p.issue = r.issue AND p.state IN ('open', 'merged'))
             ORDER BY r.issue`,
          )
          .all(githubAt),
      ).map((row) => row.issue);
      if (issues.length === 0) {
        return issues;
      }
      for (const issue of issues) {
        setState(
          db,
          issue,
          'dropped',
          { note: 'Linear canceled the issue before any PR merged' },
          actor,
        );
      }
      const seq = logEvent(db, 'run', 'sweep', 'canceled-dropped', actor, null, null, { issues });
      enqueue(
        db,
        seq,
        orchestratorName(),
        `hq dropped ${issues.join(', ')}: Linear canceled each issue, and its run had no open or merged PR. Reopen with hq run reopen <issue> if that is wrong.`,
      );
      return issues;
    })
    .immediate();
}
