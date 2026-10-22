import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { requireOpenRun as mustOpenRun } from './require-open-run.ts';
import type { RunPr } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';
import { registerRunPR as attachPr } from './register-run-pr.ts';

export function addPr(db: Database, issue: string, raw: string, actor: string): RunPr {
  return db
    .transaction(() => {
      mustOpenRun(db, issue);
      const { pr, added } = attachPr(db, issue, raw);
      if (added) {
        touch(db, issue);
        logEvent(db, 'run', issue, 'pr', actor, null, null, { ref: pr.ref });
      }
      return pr;
    })
    .immediate();
}
