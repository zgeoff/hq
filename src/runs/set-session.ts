import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { getRun } from './get-run.ts';
import { requireOpenRun as mustOpenRun } from './require-open-run.ts';
import type { RunView } from './types.ts';
import { updateRunSessions as attachSession } from './update-run-sessions.ts';
import { updateMergedRun } from './update-merged-run.ts';
import { updateRunTime as touch } from './update-run-time.ts';
import { viewRun } from './view-run.ts';

// A relaunch: the new session becomes the main one. With `add`, a helper joins
// beside it; with `remove`, a session stops being watched.
export function setSession(db: Database, issue: string, session: string, actor: string, mode: 'main' | 'add' | 'remove' = 'main'): RunView {
  return db
    .transaction(() => {
      mustOpenRun(db, issue);
      if (mode === 'remove') {
        // A session the sweep ended is removed by clearing its mark, which ends its exit alert.
        const r = db
          .query(
            "UPDATE run_sessions SET active = 0, ended_at = COALESCE(ended_at, ?), ended_by = NULL WHERE issue = ? AND (active = 1 OR ended_by = 'sweep') AND (session_id = ? OR substr(session_id, 1, 8) = ?)",
          )
          .run(iso(now()), issue, session, session);
        if (r.changes === 0) throw new HqError('not_found', `no active session ${session} on ${issue}`);
      } else {
        attachSession(db, issue, session, mode === 'add');
      }
      touch(db, issue);
      logEvent(db, 'run', issue, 'session', actor, null, null, { session, mode });
      if (mode === 'remove') {
        updateMergedRun(db, issue, actor);
      }
      return viewRun(db, getRun(db, issue)!);
    })
    .immediate();
}
