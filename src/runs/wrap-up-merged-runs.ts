import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { FleetClient, StaleOps } from '../fleet/types.ts';
import { ISSUE } from '../followups/issue.ts';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import { buildMergedWrapUpNews } from './build-merged-wrap-up-news.ts';
import { runWrapUp } from './run-wrap-up.ts';
import type { WrapUpDeps, WrapUpOptions } from './run-wrap-up.ts';
import { SWEEP_ACTOR } from './sweep-actor.ts';
import { toMessage } from './to-message.ts';
import type { WrapUp } from './types.ts';

export interface MergedRunWrapUp {
  issue: string;
  wrapUp: WrapUp;
}

const issueRowSchema = z.object({ issue: z.string() });

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

export async function wrapUpMergedRuns(db: Database, deps: WrapUpDeps, options: WrapUpOptions): Promise<MergedRunWrapUp[]> {
  const issues = db
    .query(QUALIFYING_RUNS)
    .all()
    .map((row) => issueRowSchema.parse(row).issue);
  const shared = shareClient(deps);
  const wrapped: MergedRunWrapUp[] = [];
  for (const issue of issues) {
    const wrapUp = await wrapUpRunSafely(db, shared, issue, options);
    wrapped.push({ issue, wrapUp });
    if (options.dryRun !== true) {
      recordMergedWrapUp(db, issue, wrapUp, options.actor);
    }
  }
  return wrapped;
}

// A list taken before an earlier run's forgets still holds this run's sessions: a session id is on
// one run only.
function shareClient(deps: WrapUpDeps): WrapUpDeps {
  let opened: Promise<FleetClient & StaleOps> | null = null;
  return {
    openClient: () => {
      opened ??= openListedClient(deps);
      return opened;
    },
    readImpWork: deps.readImpWork,
  };
}

async function openListedClient(deps: WrapUpDeps): Promise<FleetClient & StaleOps> {
  const client = await deps.openClient();
  const listed = await client.sessions();
  return { ...client, sessions: () => Promise.resolve(listed) };
}

async function wrapUpRunSafely(db: Database, deps: WrapUpDeps, issue: string, options: WrapUpOptions): Promise<WrapUp> {
  try {
    return await runWrapUp(db, deps, issue, options);
  } catch (error) {
    return { forgotten: [], destroyed: [], kept: [], failed: [{ id: issue, reason: toMessage(error) }] };
  }
}

// The news goes first and its failure joins the event, so the event is the last write and a run
// that failed is still marked wrapped.
function recordMergedWrapUp(db: Database, issue: string, wrapUp: WrapUp, actor: string): void {
  const text = buildMergedWrapUpNews(issue, wrapUp);
  if (text !== null) {
    try {
      addNews(db, { from: SWEEP_ACTOR, topic: 'report', text, issue: ISSUE.test(issue) ? issue : null, link: null, needsGeoff: false });
    } catch (error) {
      wrapUp.failed.push({ id: issue, reason: `news: ${toMessage(error)}` });
    }
  }
  logEvent(db, 'run', issue, 'merged-wrap-up', actor, null, null, { ...wrapUp });
}
