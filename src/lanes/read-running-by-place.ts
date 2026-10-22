import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { parkedRuns } from '../areas/parked-runs.ts';
import { RUNNING } from '../areas/running.ts';
import { now } from '../clock/now.ts';

export interface RunningByPlace {
  imp: number;
  local: number;

  // The running issues that hold a slot, parked ones left out.
  issues: string[];
}

const rowsSchema = z.array(z.object({ issue: z.string(), place: z.enum(['imp', 'local']) }));

// The runs that hold a slot now, by where they run: working or blocked with an agent, less the
// parked ones (a blocked run with no session awake, a working run whose sessions are gone).
export function readRunningByPlace(db: Database, at: Date = now()): RunningByPlace {
  const parked = new Set(parkedRuns(db, at).map((run) => run.issue));
  const rows = rowsSchema.parse(db.query(`SELECT issue, place FROM runs WHERE place != 'none' AND state IN (${RUNNING.map(() => '?').join(', ')}) ORDER BY issue`).all(...RUNNING));
  const holding = rows.filter((row) => !parked.has(row.issue));
  return { imp: holding.filter((row) => row.place === 'imp').length, local: holding.filter((row) => row.place === 'local').length, issues: holding.map((row) => row.issue) };
}
