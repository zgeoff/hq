import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { readFreshAwake } from '../../areas/read-fresh-awake.ts';
import { fleetIds } from '../../atc/fleet-ids.ts';
import { readDesignIssues } from '../read-design-issues.ts';

export interface WorkingCount {
  count: number;

  // sessions: awake sessions of working runs. runs: the working runs, as no atc reading is fresh.
  from: 'sessions' | 'runs';
}

const runsSchema = z.array(z.object({ issue: z.string() }));

const rowsSchema = z.array(z.object({ issue: z.string(), session_id: z.string() }));

// What the cap counts: the awake sessions (helpers too) of working runs, less Design runs and the
// fleet's own sessions. Runs that wait on someone else hold no session worth capping.
export function countWorking(db: Database, at: Date): WorkingCount {
  const design = readDesignIssues(db);
  const reading = readFreshAwake(db, at);
  if (reading === null) {
    const runs = runsSchema.parse(db.query("SELECT issue FROM runs WHERE state = 'working'").all());
    return { count: runs.filter((run) => !design.has(run.issue)).length, from: 'runs' };
  }
  const awake = new Set(reading.ids);
  const fleet = new Set(Object.values(fleetIds(db)));
  const rows = rowsSchema.parse(db.query("SELECT DISTINCT s.issue AS issue, s.session_id AS session_id FROM run_sessions s JOIN runs r ON r.issue = s.issue WHERE r.state = 'working'").all());
  const sessions = new Set(rows.filter((row) => awake.has(row.session_id) && !fleet.has(row.session_id) && !design.has(row.issue)).map((row) => row.session_id));
  return { count: sessions.size, from: 'sessions' };
}
