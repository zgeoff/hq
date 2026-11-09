import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { isAsleepSession } from '../areas/is-asleep-session.ts';
import { isPresentSession } from '../areas/is-present-session.ts';
import type { AwakeSession } from '../areas/types.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { isAsleepOfMergedRun } from './is-asleep-of-merged-run.ts';
import { updateMergedRun } from './update-merged-run.ts';

const ActiveSessionRows = z.array(
  z.object({
    session_id: z.string(),
    issue: z.string(),
    added_at: z.string(),
    state: z.string(),
    merged: z.number(),
    open: z.number(),
  }),
);

const READ_ACTIVE_SESSIONS = `SELECT s.session_id, s.issue, s.added_at, r.state,
    (SELECT COUNT(*) FROM run_prs p WHERE p.issue = s.issue AND p.state = 'merged' AND p.design_pass = 0) AS merged,
    (SELECT COUNT(*) FROM run_prs p WHERE p.issue = s.issue AND p.state = 'open' AND p.design_pass = 0) AS open
  FROM run_sessions s JOIN runs r ON r.issue = s.issue WHERE s.active = 1`;

export function updateGoneRunSessions(db: Database, sessions: readonly AwakeSession[], actor: string, at: Date = now()): number {
  const GONE_GRACE_MS = 5 * 60_000;
  const active = ActiveSessionRows.parse(db.query(READ_ACTIVE_SESSIONS).all());
  const end = db.query("UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?), ended_by = 'sweep' WHERE session_id = ? AND active = 1");
  const present = new Set(sessions.filter((session) => isPresentSession(session)).map((session) => session.id));
  const asleep = new Set(sessions.filter((session) => isAsleepSession(session)).map((session) => session.id));
  const stale = active.filter((row) => {
    const ageMs = at.getTime() - Date.parse(row.added_at);
    if (!present.has(row.session_id)) {
      return ageMs > GONE_GRACE_MS;
    }
    return isAsleepOfMergedRun({ asleep: asleep.has(row.session_id), runState: row.state, merged: row.merged, open: row.open, ageMs, graceMs: GONE_GRACE_MS });
  });
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
