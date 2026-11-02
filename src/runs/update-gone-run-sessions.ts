import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { isPresentSession } from '../areas/is-present-session.ts';
import type { AwakeSession } from '../areas/types.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { updateMergedRun } from './update-merged-run.ts';

const ActiveSessionRows = z.array(z.object({ session_id: z.string(), issue: z.string(), added_at: z.string() }));

export function updateGoneRunSessions(db: Database, sessions: readonly AwakeSession[], actor: string, at: Date = now()): number {
  const GONE_GRACE_MS = 5 * 60_000;
  const active = ActiveSessionRows.parse(db.query('SELECT session_id, issue, added_at FROM run_sessions WHERE active = 1').all());
  const end = db.query("UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?), ended_by = 'sweep' WHERE session_id = ? AND active = 1");
  const present = new Set(sessions.filter((session) => isPresentSession(session)).map((session) => session.id));
  const stale = active.filter((row) => !present.has(row.session_id) && at.getTime() - Date.parse(row.added_at) > GONE_GRACE_MS);
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
