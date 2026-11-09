import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { readEvents } from '../read-events.ts';
import type { StoredEvent } from '../read-events.ts';
import { buildHandedInPlan } from './build-handed-in-plan.ts';
import { claimHandedInRun } from './claim-handed-in-run.ts';
import { CLEANUP_ACTIONS, isCleanupHeld } from './is-cleanup-held.ts';
import { SCOPE_HOLD_ACTIONS } from './is-scope-held.ts';
import { collectGuardedSessions } from './collect-guarded-sessions.ts';
import { collectHeldIdleRuns } from './collect-held-idle-runs.ts';
import type { AtcSession } from './collect-guarded-sessions.ts';
import { runHandedInHoldCheck } from './run-handed-in-hold-check.ts';
import type { HandedInHolds } from './run-handed-in-hold-check.ts';
import { pickHandedInCandidates } from './pick-handed-in-candidates.ts';
import { pickQuietSessions } from './pick-quiet-sessions.ts';
import type { SessionActivity } from './pick-quiet-sessions.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { updateMergedRun } from './update-merged-run.ts';
import { shareClient, wrapUpRunSafely } from './wrap-up-merged-runs.ts';
import { writeHandedInPlan } from './write-handed-in-plan.ts';

// atc shows no background shell or sub-agent, so an agent that ends its turn to wait on one reads
// as done. Every PR has merged by now, and the unpushed-work check keeps a waiting agent's commits.
const HANDED_IN_QUIET_MS = 5 * 60_000;

const PrRows = z.array(z.object({ issue: z.string(), state: z.string(), final_sha: z.string().nullable(), merged_at: z.string().nullable() }));
const SessionRows = z.array(z.object({ issue: z.string(), session_id: z.string(), active: z.number() }));

export interface AtcView {
  readActivity: (id: string) => Promise<SessionActivity | null>;
}

export interface HandedInOptions {
  actor: string;

  // Absent, no run is held for its Linear Scope.
  holds?: HandedInHolds;
}

// Hq closes a builder's session itself once its PRs have merged and nothing is unpushed, in any run
// state. The wrap-up goes first and only the sessions it forgot end, so a kept one retries on a
// later sweep once its work is pushed.
export async function endHandedInRunSessions(db: Database, atc: AtcView, deps: WrapUpDeps, options: HandedInOptions): Promise<number> {
  const at = now();
  const quietBefore = at.getTime() - HANDED_IN_QUIET_MS;
  const prs = PrRows.parse(
    db
      .query(
        `SELECT p.issue, p.state, p.final_sha, p.merged_at FROM run_prs p JOIN runs r ON r.issue = p.issue
         WHERE r.state NOT IN ('done', 'dropped') AND p.design_pass = 0 AND p.state IN ('open', 'merged')`,
      )
      .all(),
  );
  const sessions = SessionRows.parse(
    db.query("SELECT s.issue, s.session_id, s.active FROM run_sessions s JOIN runs r ON r.issue = s.issue WHERE r.state NOT IN ('done', 'dropped') ORDER BY s.added_at").all(),
  );
  if (options.holds !== undefined) {
    await runIdleHoldChecks(db, options.holds, sessions, options.actor);
  }
  const lastKept = new Map([...new Set(sessions.map((row) => row.issue))].map((issue) => [issue, readLastKept(db, issue)] as const));
  const candidates = pickHandedInCandidates({ prs, sessions, lastKept }, at, quietBefore);
  if (candidates.length === 0) {
    return 0;
  }

  // The wrap-up walks the shared client's list, so the guard walks the same one and checks every
  // session it could forget, sub-sessions spawned since the sweep listed atc included.
  const shared = shareClient(deps);
  const client = await shared.openClient();
  const listed = await client.sessions();
  let ended = 0;
  for (const candidate of candidates) {
    const guarded = collectGuardedSessions(candidate.rows, listed);
    const activity = await readGuardedActivity(atc, guarded ?? []);
    const checked = pickQuietSessions(guarded, activity, quietBefore);
    if (checked !== null && !(await probeHeld(db, options, candidate.issue, at))) {
      ended += await endHandedInRun(db, shared, { ...candidate, checked, actor: options.actor, at });
    }
  }
  return ended;
}

const WorkingRows = z.array(z.object({ issue: z.string(), waits_on: z.string().nullable() }));

async function runIdleHoldChecks(db: Database, holds: HandedInHolds, sessions: z.infer<typeof SessionRows>, actor: string): Promise<void> {
  const working = WorkingRows.parse(db.query("SELECT issue, waits_on FROM runs WHERE state = 'working' AND waits_on IS NOT NULL").all());
  const runs = working.map((row) => ({ issue: row.issue, waitsOn: row.waits_on, newestScopeEvent: readEvents(db, 'run', row.issue, SCOPE_HOLD_ACTIONS).at(-1) }));
  const active = new Set(sessions.filter((row) => row.active === 1).map((row) => row.issue));
  for (const issue of collectHeldIdleRuns(runs, active)) {
    const check = await runHandedInHoldCheck(db, holds, issue, actor);
    if (!check.hold) {
      updateMergedRun(db, issue, actor);
    }
  }
}

function readLastKept(db: Database, issue: string): StoredEvent | null {
  return readEvents(db, 'run', issue, ['handed-in-kept']).at(-1) ?? null;
}

async function readGuardedActivity(atc: AtcView, guarded: readonly AtcSession[]): Promise<Map<string, SessionActivity | null>> {
  const read = await Promise.all(guarded.map(async (session) => [session.id, await atc.readActivity(session.id)] as const));
  return new Map(read);
}

async function probeHeld(db: Database, options: HandedInOptions, issue: string, at: Date): Promise<boolean> {
  // Another sweep's fresh claim rejects the hand-in anyway, so Linear is not read for it.
  if (options.holds === undefined || isCleanupHeld(readEvents(db, 'run', issue, CLEANUP_ACTIONS), at)) {
    return false;
  }
  const check = await runHandedInHoldCheck(db, options.holds, issue, options.actor);
  return check.hold;
}

interface HandedInRun {
  issue: string;
  ids: string[];
  checked: string[];
  actor: string;
  at: Date;
  lastKept: StoredEvent | null;
}

async function endHandedInRun(db: Database, deps: WrapUpDeps, run: HandedInRun): Promise<number> {
  const claim = claimHandedInRun(db, run.issue, run.actor, run.at);
  if (claim === null) {
    return 0;
  }
  const mergedClaimed = claim.mergedClaimed;
  const wrapUp = await wrapUpRunSafely(db, deps, run.issue, { actor: run.actor, onlyNoteAction: !mergedClaimed, onlySessions: run.checked });
  const plan = buildHandedInPlan({ ids: run.ids, wrapUp, lastKeptData: run.lastKept?.data ?? null, mergedClaimed });
  writeHandedInPlan(db, plan, { issue: run.issue, wrapUp, actor: run.actor, at: run.at });
  return plan.end.length;
}
