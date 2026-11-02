import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { logEvent } from '../log-event.ts';
import { getRun } from './get-run.ts';
import { pickOwnerWaitClear } from './pick-owner-wait-clear.ts';

const openSchema = z.object({ open: z.number() });

// Clears the owner wait of the run a PR just merged on, when pickOwnerWaitClear says the merge ended
// it, and logs which rule did. Reads the PR table as it stands, so call it after the PR is marked merged.
export function clearOwnerWait(db: Database, issue: string, mergedRef: string, actor: string): void {
  const run = getRun(db, issue);
  if (run === null) {
    return;
  }
  const count = openSchema.parse(db.query(`SELECT COUNT(*) AS open FROM run_prs WHERE issue = ? AND state = 'open' AND design_pass = 0`).get(issue));
  const rule = pickOwnerWaitClear({ waitsOnGeoff: run.waits_on_geoff === 1, waitsOn: run.waits_on }, mergedRef, count.open);
  if (rule === null) {
    return;
  }
  db.query('UPDATE runs SET waits_on = NULL, waits_on_geoff = 0 WHERE issue = ?').run(issue);
  logEvent(db, 'run', issue, 'owner-wait-cleared', actor, null, null, { ref: mergedRef, waitsOn: run.waits_on, rule });
}
