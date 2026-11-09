import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { requireOpenRun as mustOpenRun } from './require-open-run.ts';
import type { RunPR } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';
import { registerRunPR as attachPR } from './register-run-pr.ts';

export function addPR(db: Database, issue: string, raw: string, actor: string): RunPR {
  return db
    .transaction(() => {
      mustOpenRun(db, issue);
      const attached = attachPR(db, issue, raw);
      const pr = attached.pr;
      if (attached.added) {
        touch(db, issue);
        logEvent(db, 'run', issue, 'pr', actor, null, null, { ref: pr.ref });
      }
      return pr;
    })
    .immediate();
}
