import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { FleetClient, StaleOps } from '../fleet/types.ts';
import { ISSUE } from '../followups/issue.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { addNews } from '../news/add-news.ts';
import { readEvents } from '../read-events.ts';
import { buildMergedWrapUpNews } from './build-merged-wrap-up-news.ts';
import { CLEANUP_ACTIONS, isCleanupHeld } from './is-cleanup-held.ts';
import { iso } from '../clock/iso.ts';
import { MERGED_RETRY_WINDOW_MS } from './constants.ts';
import { pickMergedRetry } from './pick-merged-retry.ts';
import type { MergedRetryFacts } from './pick-merged-retry.ts';
import { runWrapUp } from './run-wrap-up.ts';
import type { WrapUpDeps, WrapUpOptions } from './run-wrap-up.ts';
import { shouldPostRetryNews } from './should-post-retry-news.ts';
import { SWEEP_ACTOR } from './sweep-actor.ts';
import { toErrorMessage } from '../to-error-message.ts';
import type { WrapUp } from './types.ts';

export interface MergedRunWrapUp {
  issue: string;
  wrapUp: WrapUp;
}

const issueRowSchema = z.object({ issue: z.string() });

const IS_MERGED = `
  r.state IN ('merged', 'live-check', 'deploy-held')
    AND EXISTS (SELECT 1 FROM run_prs p WHERE p.issue = r.issue AND p.state = 'merged' AND p.design_pass = 0)
    AND NOT EXISTS (SELECT 1 FROM run_prs p WHERE p.issue = r.issue AND p.state NOT IN ('merged', 'closed') AND p.design_pass = 0)`;

const QUALIFIES = `${IS_MERGED}
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

  // Listed before the first passes, so a run's first pass and its retry never share a sweep.
  const retryIssues = listRetryRuns(db);
  for (const issue of issues) {
    if (options.dryRun === true) {
      wrapped.push({ issue, wrapUp: await wrapUpRunSafely(db, shared, issue, options) });
    } else if (claimMergedRun(db, issue, options.actor)) {
      const wrapUp = await wrapUpRunSafely(db, shared, issue, options);
      wrapped.push({ issue, wrapUp });
      recordMergedWrapUp(db, issue, wrapUp, options.actor);
    }
  }
  for (const issue of retryIssues) {
    if (options.dryRun === true) {
      const retry = readMergedRetry(db, issue);
      if (retry !== null) {
        wrapped.push({ issue, wrapUp: await wrapUpRunSafely(db, shared, issue, { dryRun: true, onlySessions: retry.sessions }) });
      }
    } else {
      const retry = claimMergedRetry(db, issue, options.actor);
      if (retry !== null) {
        const wrapUp = await wrapUpRunSafely(db, shared, issue, { actor: options.actor, onlyNoteAction: true, onlySessions: retry.sessions });
        wrapped.push({ issue, wrapUp });
        if (shouldPostRetryNews(wrapUp, retry.attempt)) {
          recordMergedWrapUp(db, issue, wrapUp, options.actor);
        } else {
          logEvent(db, 'run', issue, 'merged-wrap-up-result', options.actor, null, null, { ...wrapUp });
        }
      }
    }
  }
  return wrapped;
}

const LAST_MERGE_SEQ = "(SELECT MAX(m.seq) FROM events m WHERE m.subject = 'run' AND m.subject_id = r.issue AND m.action = 'state' AND m.to_state = 'merged')";

const RETRY_RUNS = `SELECT r.issue FROM runs r JOIN events merged_event ON merged_event.seq = ${LAST_MERGE_SEQ}
  WHERE ${IS_MERGED}
    AND merged_event.at > ?
    AND EXISTS (
      SELECT 1 FROM events w
      WHERE w.subject = 'run' AND w.subject_id = r.issue AND w.action = 'merged-wrap-up-result' AND w.seq > merged_event.seq)
  ORDER BY r.issue`;

// Only runs merged within the retry window, so a sweep takes no write lock for a run that can no
// longer retry.
function listRetryRuns(db: Database): string[] {
  const cutoff = iso(new Date(now().getTime() - MERGED_RETRY_WINDOW_MS));
  return db
    .query(RETRY_RUNS)
    .all(cutoff)
    .map((row) => issueRowSchema.parse(row).issue);
}

interface MergedRetryClaim {
  sessions: string[];
  attempt: number;
}

// A handed-in pass may hold the run's cleanup, as it does for a merged-run claim.
function readMergedRetry(db: Database, issue: string): MergedRetryClaim | null {
  if (db.query(`SELECT r.issue FROM runs r WHERE r.issue = ? AND ${IS_MERGED}`).get(issue) === null || isCleanupHeld(readEvents(db, 'run', issue, CLEANUP_ACTIONS), now())) {
    return null;
  }
  const facts = readRetryFacts(db, issue);
  const sessions = pickMergedRetry(facts);
  return sessions === null ? null : { sessions, attempt: facts.retries + 1 };
}

const mergedRowSchema = z.object({ seq: z.number(), at: z.string() });
const keptSessionSchema = z.object({ id: z.string(), reason: z.string(), retry: z.literal(true).optional() });
const resultDataSchema = z.object({ kept: z.array(keptSessionSchema) });

function readRetryFacts(db: Database, issue: string): MergedRetryFacts {
  const merged = db.query("SELECT seq, at FROM events WHERE subject = 'run' AND subject_id = ? AND action = 'state' AND to_state = 'merged' ORDER BY seq DESC LIMIT 1").get(issue);
  const mergedRow = merged === null ? null : mergedRowSchema.parse(merged);
  const events = readEvents(db, 'run', issue, ['merged-wrap-up', 'merged-wrap-up-retry', 'merged-wrap-up-result']).filter((event) => event.seq > (mergedRow?.seq ?? 0));
  const result = events.findLast((event) => event.action === 'merged-wrap-up-result');
  return {
    mergedAtMs: mergedRow === null ? null : Date.parse(mergedRow.at),
    nowMs: now().getTime(),
    retries: events.filter((event) => event.action === 'merged-wrap-up-retry').length,
    claimOpen: events.at(-1)?.action !== 'merged-wrap-up-result',
    kept: result === undefined ? [] : resultDataSchema.parse(JSON.parse(result.data)).kept,
  };
}

// The retry claim is an event, so two sweeps cannot take one retry.
function claimMergedRetry(db: Database, issue: string, actor: string): MergedRetryClaim | null {
  return db
    .transaction(() => {
      const retry = readMergedRetry(db, issue);
      if (retry !== null) {
        logEvent(db, 'run', issue, 'merged-wrap-up-retry', actor, null, null, { sessions: retry.sessions });
      }
      return retry;
    })
    .immediate();
}

// A list taken before an earlier run's forgets still holds this run's sessions: a session id is on
// one run only.
export function shareClient(deps: WrapUpDeps): WrapUpDeps {
  let opened: Promise<FleetClient & StaleOps> | null = null;
  return {
    openClient: () => {
      opened ??= openListedClient(deps);
      return opened;
    },
    readImpWork: deps.readImpWork,
    readLocalWork: deps.readLocalWork,
  };
}

async function openListedClient(deps: WrapUpDeps): Promise<FleetClient & StaleOps> {
  const client = await deps.openClient();
  const listed = await client.sessions();
  return { ...client, sessions: () => Promise.resolve(listed) };
}

export async function wrapUpRunSafely(db: Database, deps: WrapUpDeps, issue: string, options: WrapUpOptions): Promise<WrapUp> {
  try {
    return await runWrapUp(db, deps, issue, options);
  } catch (error) {
    return { forgotten: [], destroyed: [], kept: [], failed: [{ id: issue, reason: toErrorMessage(error) }] };
  }
}

const QUALIFYING_RUN = `SELECT r.issue FROM runs r WHERE r.issue = ? AND ${QUALIFIES}`;

// Another pass, such as a watcher sweep beside hq run tidy, may have claimed the run since this
// pass listed it, and its wrap-up is still running.
function claimMergedRun(db: Database, issue: string, actor: string): boolean {
  return db.transaction(() => !isCleanupHeld(readEvents(db, 'run', issue, CLEANUP_ACTIONS), now()) && writeMergedClaim(db, issue, actor)).immediate();
}

// Call it inside an immediate transaction, so the check and the claim are one step.
export function writeMergedClaim(db: Database, issue: string, actor: string): boolean {
  if (db.query(QUALIFYING_RUN).get(issue) === null) {
    return false;
  }
  logEvent(db, 'run', issue, 'merged-wrap-up', actor, null, null);
  return true;
}

// The news goes first so that its failure joins the result.
export function recordMergedWrapUp(db: Database, issue: string, wrapUp: WrapUp, actor: string): void {
  const text = buildMergedWrapUpNews(issue, wrapUp);
  if (text !== null) {
    try {
      addNews(db, { from: SWEEP_ACTOR, topic: 'report', text, issue: ISSUE.test(issue) ? issue : null, link: null, needsGeoff: false });
    } catch (error) {
      wrapUp.failed.push({ id: issue, reason: `news: ${toErrorMessage(error)}` });
    }
  }
  logEvent(db, 'run', issue, 'merged-wrap-up-result', actor, null, null, { ...wrapUp });
}
