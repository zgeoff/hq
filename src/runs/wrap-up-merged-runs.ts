import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import { buildMergedWrapUpNews } from './build-merged-wrap-up-news.ts';
import { runWrapUp } from './run-wrap-up.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { SWEEP_ACTOR } from './sweep-actor.ts';
import type { WrapUp } from './types.ts';

export interface MergedRunWrapUp {
  issue: string;
  wrapUp: WrapUp;
}

const issueRowSchema = z.object({ issue: z.string() });

// A run is past merge when its state says so and every PR of it is settled, with one merged. It is
// wrapped once per merge: a merged-wrap-up event after the run's latest move to merged marks it.
const QUALIFYING_RUNS = `
  SELECT r.issue FROM runs r
  WHERE r.state IN ('merged', 'live-check', 'deploy-held')
    AND EXISTS (SELECT 1 FROM run_prs p WHERE p.issue = r.issue AND p.state = 'merged')
    AND NOT EXISTS (SELECT 1 FROM run_prs p WHERE p.issue = r.issue AND p.state NOT IN ('merged', 'closed'))
    AND NOT EXISTS (
      SELECT 1 FROM events w
      WHERE w.subject = 'run' AND w.subject_id = r.issue AND w.action = 'merged-wrap-up'
        AND w.seq > COALESCE((SELECT MAX(m.seq) FROM events m WHERE m.subject = 'run' AND m.subject_id = r.issue AND m.action = 'state' AND m.to_state = 'merged'), 0))
  ORDER BY r.issue`;

// Wraps up the sessions of each run past merge, once. The run's state stays as it is. A session the
// wrap-up kept or failed on is named in one news item, and is not retried. A dry run only reports.
export async function wrapUpMergedRuns(db: Database, deps: WrapUpDeps, actor: string, options: { dryRun?: boolean } = {}): Promise<MergedRunWrapUp[]> {
  const dryRun = options.dryRun === true;
  const issues = db
    .query(QUALIFYING_RUNS)
    .all()
    .map((row) => issueRowSchema.parse(row).issue);
  const wrapped: MergedRunWrapUp[] = [];
  for (const issue of issues) {
    const wrapUp = await runWrapUp(db, deps, issue, { actor, dryRun });
    wrapped.push({ issue, wrapUp });
    if (dryRun) {
      continue;
    }
    logEvent(db, 'run', issue, 'merged-wrap-up', actor, null, null, { ...wrapUp });
    const text = buildMergedWrapUpNews(issue, wrapUp);
    if (text !== null) {
      addNews(db, { from: SWEEP_ACTOR, topic: 'report', text, issue, link: null, needsGeoff: false });
    }
  }
  return wrapped;
}
