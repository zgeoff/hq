import type { Database } from 'bun:sqlite';
import { isPresentSession } from '../areas/is-present-session.ts';
import type { AwakeSession } from '../areas/types.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { updateMergedRun } from './update-merged-run.ts';

// Ends every active run session atc no longer lists, past one sweep (5 min) of grace, and marks it
// ended by the sweep: findAlerts keeps raising a working run's exit alert from that mark. A run
// whose work is merged moves to merged once its last session ends.
export function updateGoneRunSessions(db: Database, sessions: readonly AwakeSession[], actor: string, at: Date = now()): number {
  const GONE_GRACE_MS = 5 * 60_000,
    active = db.query('SELECT session_id, issue, added_at FROM run_sessions WHERE active = 1').all() as { session_id: string; issue: string; added_at: string }[],
    end = db.query("UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?), ended_by = 'sweep' WHERE session_id = ? AND active = 1"),
    present = new Set(sessions.filter((session) => isPresentSession(session)).map((session) => session.id)),
    stale = active.filter((row) => !present.has(row.session_id) && at.getTime() - Date.parse(row.added_at) > GONE_GRACE_MS);
  db.transaction(() => {
    for (const row of stale) {
      end.run(iso(at), row.session_id);
    }
    for (const issue of new Set(stale.map((row) => row.issue))) {
      updateMergedRun(db, issue, actor);
    }
  })();
  return stale.length;
}
