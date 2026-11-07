import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { parkedRuns } from '../areas/parked-runs.ts';
import { readFreshAwake } from '../areas/read-fresh-awake.ts';
import { readLaneHolders } from '../areas/read-lane-holders.ts';
import { RUNNING } from '../areas/running.ts';
import { now } from '../clock/now.ts';
import { readDesignRuns } from './read-design-runs.ts';
import type { DesignRun } from './read-design-runs.ts';

export interface RunningByPlace {
  imp: number;
  local: number;
  issues: string[];
  impIssues: string[];
  localSource: string | null;
}

const rowsSchema = z.array(z.object({ issue: z.string(), place: z.enum(['imp', 'local']) }));

export function readRunningByPlace(db: Database, at: Date = now(), designRuns: readonly DesignRun[] = readDesignRuns(db)): RunningByPlace {
  const parked = new Set(parkedRuns(db, at).map((run) => run.issue));
  const design = new Set(designRuns.map((run) => run.issue));
  const rows = rowsSchema.parse(db.query(`SELECT issue, place FROM runs WHERE place != 'none' AND state IN (${RUNNING.map(() => '?').join(', ')}) ORDER BY issue`).all(...RUNNING));
  const holding = rows.filter((row) => !parked.has(row.issue) && !design.has(row.issue));
  const live = readLiveLocal(db, at, design);
  const movedHere = holding.filter((row) => row.place === 'imp' && live?.hereOnly.has(row.issue) === true).length;
  const filedLocal = holding.filter((row) => row.place === 'local').length + movedHere;
  const impIssues = holding.filter((row) => row.place === 'imp' && live?.hereOnly.has(row.issue) !== true).map((row) => row.issue);
  const imp = impIssues.reduce((total, issue) => total + Math.max(1, live?.elsewhere.get(issue) ?? 0), 0);
  const issues = holding.map((row) => row.issue);
  if (live === null || live.sessions <= filedLocal) {
    return { imp, local: filedLocal, issues, impIssues, localSource: null };
  }
  const plural = live.sessions === 1 ? '' : 's';
  return { imp, local: live.sessions, issues, impIssues, localSource: `${live.sessions} live session${plural} here` };
}

interface LiveLocal {
  sessions: number;
  hereOnly: Set<string>;
  elsewhere: Map<string, number>;
}

// Null for a reading from before the sweep recorded the local sessions.
function readLiveLocal(db: Database, at: Date, design: ReadonlySet<string>): LiveLocal | null {
  const reading = readFreshAwake(db, at);
  if (reading?.local === undefined) {
    return null;
  }
  const here = new Set(reading.local);
  const rows = readLaneHolders(db, reading, at).filter((row) => !design.has(row.issue));
  const sessions = new Set(rows.filter((row) => here.has(row.session_id)).map((row) => row.session_id)).size;
  const elsewhere = new Map<string, number>();
  for (const row of rows.filter((other) => !here.has(other.session_id))) {
    elsewhere.set(row.issue, (elsewhere.get(row.issue) ?? 0) + 1);
  }
  const hereOnly = new Set(rows.filter((row) => here.has(row.session_id) && !elsewhere.has(row.issue)).map((row) => row.issue));
  return { sessions, hereOnly, elsewhere };
}
