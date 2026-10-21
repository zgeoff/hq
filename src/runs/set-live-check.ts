import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getRun } from './get-run.ts';
import { requireLiveCheck as checkLiveCheck } from './require-live-check.ts';
import { requireOpenRun as mustOpenRun } from './require-open-run.ts';
import type { RunView } from './types.ts';
import { viewRun } from './view-run.ts';

// Whether a live check is owed once the release ships. Unset counts as owed.
export function setLiveCheck(db: Database, issue: string, value: string, actor: string): RunView {
  checkLiveCheck(value);
  return db
    .transaction(() => {
      const prev = mustOpenRun(db, issue);
      db.query('UPDATE runs SET live_check = ?, updated_at = ? WHERE issue = ?').run(value, iso(now()), issue);
      logEvent(db, 'run', issue, 'check', actor, null, null, { check: value, was: prev.live_check });
      return viewRun(db, getRun(db, issue)!);
    })
    .immediate();
}
