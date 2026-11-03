import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { AwakeSession } from '../areas/types.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import { updateMergedRun } from './update-merged-run.ts';

const HANDED_IN_QUIET_MS = 10 * 60_000;

const PrRows = z.array(z.object({ issue: z.string(), state: z.string(), final_sha: z.string().nullable(), merged_at: z.string().nullable() }));
const SessionRows = z.array(z.object({ issue: z.string(), session_id: z.string() }));

// A stacked run merges a lower layer with its FINAL while its agent still builds the next one, so
// a session ends only once atc shows it done and quiet.
export interface AtcView {
  sessions: readonly AwakeSession[];
  activity: ReadonlyMap<string, number | null>;
}

export function endHandedInRunSessions(db: Database, atc: AtcView, actor: string, at: Date = now()): number {
  const prs = PrRows.parse(
    db
      .query(
        `SELECT p.issue, p.state, p.final_sha, p.merged_at FROM run_prs p JOIN runs r ON r.issue = p.issue
         WHERE r.state = 'working' AND p.design_pass = 0 AND p.state IN ('open', 'merged')`,
      )
      .all(),
  );
  const active = SessionRows.parse(
    db.query("SELECT s.issue, s.session_id FROM run_sessions s JOIN runs r ON r.issue = s.issue WHERE r.state = 'working' AND s.active = 1 ORDER BY s.added_at").all(),
  );
  const stateOf = new Map(atc.sessions.map((session) => [session.id, session.state]));
  const quietBefore = at.getTime() - HANDED_IN_QUIET_MS;
  const end = db.query("UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?), ended_by = 'sweep' WHERE session_id = ? AND active = 1");
  let ended = 0;
  for (const issue of new Set(active.map((row) => row.issue))) {
    const issuePrs = prs.filter((row) => row.issue === issue);
    const merged = issuePrs.filter((row) => row.state === 'merged');
    const handedIn = merged.length > 0 && merged.length === issuePrs.length && merged.every((row) => row.final_sha !== null && Date.parse(row.merged_at ?? '') <= quietBefore);
    const ids = active.filter((row) => row.issue === issue).map((row) => row.session_id);
    const quiet = ids.every((id) => {
      const last = atc.activity.get(id);
      return stateOf.get(id) === 'done' && typeof last === 'number' && last <= quietBefore;
    });
    if (!handedIn || !quiet) {
      continue;
    }
    db.transaction(() => {
      for (const id of ids) {
        end.run(iso(at), id);
      }
      logEvent(db, 'run', issue, 'handed-in-ended', actor, null, null, { sessions: ids });
      updateMergedRun(db, issue, actor);
    })();
    ended += ids.length;
  }
  return ended;
}
