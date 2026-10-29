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

const QUALIFIES = `
  r.state IN ('merged', 'live-check', 'deploy-held')
    AND EXISTS (SELECT 1 FROM run_prs p WHERE p.issue = r.issue AND p.state = 'merged' AND p.design_pass = 0)
    AND NOT EXISTS (SELECT 1 FROM run_prs p WHERE p.issue = r.issue AND p.state NOT IN ('merged', 'closed') AND p.design_pass = 0)
    AND NOT EXISTS (
      SELECT 1 FROM events w
      WHERE w.subject = 'run' AND w.subject_id = r.issue AND w.action = 'merged-wrap-up'
        AND w.seq > COALESCE((SELECT MAX(m.seq) FROM events m WHERE m.subject = 'run' AND m.subject_id = r.issue AND m.action = 'state' AND m.to_state = 'merged'), 0))`;

const QUALIFYING_RUNS = `SELECT r.issue FROM runs r WHERE ${QUALIFIES} ORDER BY r.issue`;

export async function wrapUpMergedRuns(db: Database, deps: WrapUpDeps, options: WrapUpOptions): Promise<MergedRunWrapUp[]> {
  const issues = db
    .query(QUALIFYING_RUNS)
    .all()
    .map((row) => issueRowSchema.parse(row).issue);
  const shared = shareClient(deps);
  const wrapped: MergedRunWrapUp[] = [];
  for (const issue of issues) {
    if (options.dryRun === true) {
      wrapped.push({ issue, wrapUp: await wrapUpRunSafely(db, shared, issue, options) });
    } else if (claimMergedRun(db, issue, options.actor)) {
      const wrapUp = await wrapUpRunSafely(db, shared, issue, options);
      wrapped.push({ issue, wrapUp });
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

const QUALIFYING_RUN = `SELECT r.issue FROM runs r WHERE r.issue = ? AND ${QUALIFIES}`;

// Another pass, such as a watcher sweep beside hq run tidy, may have claimed the run since this
// pass listed it, and its wrap-up is still running.
function claimMergedRun(db: Database, issue: string, actor: string): boolean {
  return db
    .transaction(() => {
      if (db.query(QUALIFYING_RUN).get(issue) === null) {
        return false;
      }
      logEvent(db, 'run', issue, 'merged-wrap-up', actor, null, null);
      return true;
    })
    .immediate();
}

// The news goes first so that its failure joins the result.
function recordMergedWrapUp(db: Database, issue: string, wrapUp: WrapUp, actor: string): void {
  const text = buildMergedWrapUpNews(issue, wrapUp);
  if (text !== null) {
    try {
      addNews(db, { from: SWEEP_ACTOR, topic: 'report', text, issue: ISSUE.test(issue) ? issue : null, link: null, needsGeoff: false });
    } catch (error) {
      wrapUp.failed.push({ id: issue, reason: `news: ${toMessage(error)}` });
    }
  }
  logEvent(db, 'run', issue, 'merged-wrap-up-result', actor, null, null, { ...wrapUp });
}
