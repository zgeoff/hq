import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { AwakeSession } from '../areas/types.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { updateMergedRun } from './update-merged-run.ts';
import { claimMergedRun, recordMergedWrapUp, shareClient, wrapUpRunSafely } from './wrap-up-merged-runs.ts';

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
  at?: Date;
}

// Hq closes a builder's session itself once its PRs have merged and nothing is unpushed, in any run
// state. The wrap-up goes first and only the sessions it forgot end, so a kept one retries on a
// later sweep once its work is pushed.
export async function endHandedInRunSessions(db: Database, atc: AtcView, deps: WrapUpDeps, options: HandedInOptions): Promise<number> {
  const at = options.at ?? now();
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
    if (isHandedIn(prs.filter((row) => row.issue === issue), ids, atc, quietBefore)) {
      ended += await endHandedInRun(db, shared, { issue, ids, actor: options.actor, at });
    }
  }
  return ended;
}

type PrRow = z.infer<typeof PrRows>[number];

// A stacked run merges a lower layer with its FINAL while its agent still builds the next one, so
// a session ends only once atc shows it done and quiet.
function isHandedIn(prs: readonly PrRow[], ids: readonly string[], atc: AtcView, quietBefore: number): boolean {
  const merged = prs.filter((row) => row.state === 'merged');
  const allMerged = merged.length > 0 && merged.length === prs.length && merged.every((row) => row.final_sha !== null && Date.parse(row.merged_at ?? '') <= quietBefore);
  const states = new Map(atc.sessions.map((session) => [session.id, session.state]));
  return (
    allMerged &&
    ids.every((id) => {
      const last = atc.activity.get(id);
      return states.get(id) === 'done' && typeof last === 'number' && last <= quietBefore;
    })
  );
}

interface HandedInRun {
  issue: string;
  ids: string[];
  actor: string;
  at: Date;
}

async function endHandedInRun(db: Database, deps: WrapUpDeps, run: HandedInRun): Promise<number> {
  // A run already in merged, live-check or deploy-held and not yet wrapped up is claimed like the
  // merged-run pass would, so that pass skips it afterwards.
  const claimed = claimMergedRun(db, run.issue, run.actor);
  const wrapUp = await wrapUpRunSafely(db, deps, run.issue, { actor: run.actor, onlyNoteAction: !claimed });
  const forgotten = run.ids.filter((id) => wrapUp.forgotten.some((gone) => gone.startsWith(id) || id.startsWith(gone)));
  if (forgotten.length === 0) {
    if (claimed) {
      recordMergedWrapUp(db, run.issue, wrapUp, run.actor);
    }
    return 0;
  }
  const end = db.query("UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?), ended_by = 'sweep' WHERE session_id = ? AND active = 1");
  db.transaction(() => {
    for (const id of forgotten) {
      end.run(iso(run.at), id);
    }
    logEvent(db, 'run', run.issue, 'handed-in-ended', run.actor, null, null, { sessions: forgotten });

    // The merged-run pass qualifies a run by a wrap-up event after its move to merged, so the claim
    // goes in with the move and no other pass can take the run between them.
    if (updateMergedRun(db, run.issue, run.actor)) {
      logEvent(db, 'run', run.issue, 'merged-wrap-up', run.actor, null, null);
    }
  }).immediate();
  recordMergedWrapUp(db, run.issue, wrapUp, run.actor);
  return forgotten.length;
}
