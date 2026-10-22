import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getRun } from './get-run.ts';
import { requireOpenRun as mustOpenRun } from './require-open-run.ts';
import type { RunView } from './types.ts';
import { viewRun } from './view-run.ts';

export function setGeoffChat(db: Database, issue: string, on: boolean, actor: string): RunView {
  return db
    .transaction(() => {
      mustOpenRun(db, issue);
      db.query('UPDATE runs SET geoff_chat = ?, updated_at = ? WHERE issue = ?').run(on ? 1 : 0, iso(now()), issue);
      logEvent(db, 'run', issue, 'geoff-chat', actor, null, null, { on });
      return viewRun(db, getRun(db, issue)!);
    })
    .immediate();
}
