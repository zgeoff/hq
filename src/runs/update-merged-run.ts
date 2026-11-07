import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { z } from 'zod';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { readEvents } from '../read-events.ts';
import { SCOPE_HOLD_ACTIONS, isScopeHeld } from './is-scope-held.ts';
import { RunSchema } from './run-schema.ts';
import { setState } from './set-state.ts';

const MergedFactsSchema = RunSchema.pick({ state: true, waits_on: true }).extend({ merged: z.number(), open: z.number(), active: z.number() });

// The PR's merge and its session's end come in either order, so each calls this.
export function updateMergedRun(db: Database, issue: string, actor: string): boolean {
  const query = sql`SELECT r.state, r.waits_on,
         (SELECT COUNT(*) FROM run_prs p WHERE p.issue = r.issue AND p.state = 'merged' AND p.design_pass = 0) AS merged,
         (SELECT COUNT(*) FROM run_prs p WHERE p.issue = r.issue AND p.state = 'open' AND p.design_pass = 0) AS open,
         (SELECT COUNT(*) FROM run_sessions s WHERE s.issue = r.issue AND s.active = 1) AS active
       FROM runs r WHERE r.issue = ${issue}`.compile(kdb(db));
  const run = runSyncRow(db, query, MergedFactsSchema);
  if (run === null || run.state !== 'working' || run.merged === 0 || run.open > 0 || run.active > 0) {
    return false;
  }
  if (isScopeHeld(run.waits_on, readEvents(db, 'run', issue, SCOPE_HOLD_ACTIONS).at(-1))) {
    return false;
  }
  setState(db, issue, 'merged', {}, actor);
  return true;
}
