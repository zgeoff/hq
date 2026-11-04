import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { AwakeSession } from '../areas/types.ts';
import { now } from '../clock/now.ts';
import { readEvents } from '../read-events.ts';
import type { StoredEvent } from '../read-events.ts';
import { buildHandedInPlan } from './build-handed-in-plan.ts';
import { claimHandedInRun } from './claim-handed-in-run.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { shareClient, wrapUpRunSafely } from './wrap-up-merged-runs.ts';
import { writeHandedInPlan } from './write-handed-in-plan.ts';

// atc shows no background shell or sub-agent, so an agent that ends its turn to wait on one reads
// as done: the quiet time outlasts a CI watch or a sketch run between a stack's layers.
const HANDED_IN_QUIET_MS = 30 * 60_000;

const PrRows = z.array(z.object({ issue: z.string(), state: z.string(), final_sha: z.string().nullable(), merged_at: z.string().nullable() }));
const SessionRows = z.array(z.object({ issue: z.string(), session_id: z.string() }));

export interface AtcView {
  sessions: readonly AwakeSession[];
  activity: ReadonlyMap<string, number | null>;
}

export interface HandedInOptions {
  actor: string;
}

// Hq closes a builder's session itself once its PRs have merged and nothing is unpushed, in any run
// state. The wrap-up goes first and only the sessions it forgot end, so a kept one retries on a
// later sweep once its work is pushed.
export async function endHandedInRunSessions(db: Database, atc: AtcView, deps: WrapUpDeps, options: HandedInOptions): Promise<number> {
  const at = now();
  const prs = PrRows.parse(
    db
      .query(
        `SELECT p.issue, p.state, p.final_sha, p.merged_at FROM run_prs p JOIN runs r ON r.issue = p.issue
         WHERE r.state NOT IN ('done', 'dropped') AND p.design_pass = 0 AND p.state IN ('open', 'merged')`,
      )
      .all(),
  );
  const active = SessionRows.parse(
    db.query("SELECT s.issue, s.session_id FROM run_sessions s JOIN runs r ON r.issue = s.issue WHERE r.state NOT IN ('done', 'dropped') AND s.active = 1 ORDER BY s.added_at").all(),
  );
  const quietBefore = at.getTime() - HANDED_IN_QUIET_MS;
  const shared = shareClient(deps);
  let ended = 0;
  for (const issue of new Set(active.map((row) => row.issue))) {
    const ids = active.filter((row) => row.issue === issue).map((row) => row.session_id);
    const lastKept = readLastKept(db, issue);
    if (isHandedIn(prs.filter((row) => row.issue === issue), ids, atc, quietBefore) && !isKeptRecently(lastKept, at)) {
      ended += await endHandedInRun(db, shared, { issue, ids, actor: options.actor, at, lastKept });
    }
  }
  return ended;
}

function readLastKept(db: Database, issue: string): StoredEvent | null {
  return readEvents(db, 'run', issue, ['handed-in-kept']).at(-1) ?? null;
}

type PrRow = z.infer<typeof PrRows>[number];

// A stacked run merges a lower layer with its FINAL while its agent still builds the next one, so
// a session ends only once atc shows it done and quiet.
function isHandedIn(prs: readonly PrRow[], ids: readonly string[], atc: AtcView, quietBefore: number): boolean {
  const merged = prs.filter((row) => row.state === 'merged');
  const allMerged = merged.length > 0 && merged.length === prs.length && merged.every((row) => row.final_sha !== null && Date.parse(row.merged_at ?? '') <= quietBefore);
  return (
    allMerged &&
    ids.every((id) => {
      const session = findAtcSession(atc.sessions, id);
      const last = atc.activity.get(id) ?? (session === null ? undefined : atc.activity.get(session.id));
      return session?.state === 'done' && typeof last === 'number' && last <= quietBefore;
    })
  );
}

// A run can store a short session id, which matches the full id atc lists by prefix.
function findAtcSession(sessions: readonly AwakeSession[], id: string): AwakeSession | null {
  const prefix = id.toLowerCase();
  const hits = sessions.filter((session) => session.id.toLowerCase().startsWith(prefix));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

// Each retry of a kept session reads its work again, an imp exec of up to 2 minutes or a local git
// check, so a run whose wrap-up kept a session waits this long before the next try.
const KEPT_RETRY_MS = 30 * 60_000;

function isKeptRecently(lastKept: StoredEvent | null, at: Date): boolean {
  return lastKept !== null && Date.parse(lastKept.at) > at.getTime() - KEPT_RETRY_MS;
}

interface HandedInRun {
  issue: string;
  ids: string[];
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
  const wrapUp = await wrapUpRunSafely(db, deps, run.issue, { actor: run.actor, onlyNoteAction: !mergedClaimed });
  const plan = buildHandedInPlan({ ids: run.ids, wrapUp, lastKeptData: run.lastKept?.data ?? null, mergedClaimed });
  writeHandedInPlan(db, plan, { issue: run.issue, wrapUp, actor: run.actor, at: run.at });
  return plan.end.length;
}
