import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { parkedRuns } from '../areas/parked-runs.ts';
import { readFreshAwake } from '../areas/read-fresh-awake.ts';
import { RUNNING } from '../areas/running.ts';
import { now } from '../clock/now.ts';
import { readDesignRuns } from './read-design-runs.ts';

export interface RunningByPlace {
  imp: number;
  local: number;

  // The running issues that hold a slot, parked ones left out.
  issues: string[];

  // Those of them that hold an imp slot.
  impIssues: string[];

  // Why local is more than the runs here hold, or null when those runs set it.
  localSource: string | null;
}

const rowsSchema = z.array(z.object({ issue: z.string(), place: z.enum(['imp', 'local']) }));

export function readRunningByPlace(db: Database, at: Date = now()): RunningByPlace {
  const parked = new Set(parkedRuns(db, at).map((run) => run.issue));
  const design = new Set(readDesignRuns(db).map((run) => run.issue));
  const rows = rowsSchema.parse(db.query(`SELECT issue, place FROM runs WHERE place != 'none' AND state IN (${RUNNING.map(() => '?').join(', ')}) ORDER BY issue`).all(...RUNNING));
  const holding = rows.filter((row) => !parked.has(row.issue) && !design.has(row.issue));
  const live = readLiveLocal(db, at, design);
  const movedHere = holding.filter((row) => row.place === 'imp' && live?.hereOnly.has(row.issue) === true).length;
  const filedLocal = holding.filter((row) => row.place === 'local').length + movedHere;
  const impIssues = holding.filter((row) => row.place === 'imp' && live?.hereOnly.has(row.issue) !== true).map((row) => row.issue);
  const imp = impIssues.length;
  const issues = holding.map((row) => row.issue);
  if (live === null || live.sessions <= filedLocal) {
    return { imp, local: filedLocal, issues, impIssues, localSource: null };
  }
  const plural = live.sessions === 1 ? '' : 's';
  return { imp, local: live.sessions, issues, impIssues, localSource: `${live.sessions} live session${plural} here` };
}

interface LiveLocal {
  sessions: number;

  // The runs whose awake sessions all run on this PC.
  hereOnly: Set<string>;
}

const sessionsSchema = z.array(z.object({ issue: z.string(), session_id: z.string() }));

// Null with no fresh reading, or one from before the sweep recorded the local sessions.
function readLiveLocal(db: Database, at: Date, design: ReadonlySet<string>): LiveLocal | null {
  const reading = readFreshAwake(db, at);
  if (reading?.local === undefined) {
    return null;
  }
  const awake = new Set(reading.ids);
  const here = new Set(reading.local);
  const rows = sessionsSchema.parse(db.query('SELECT DISTINCT issue, session_id FROM run_sessions').all()).filter((row) => awake.has(row.session_id) && !design.has(row.issue));
  const sessions = new Set(rows.filter((row) => here.has(row.session_id)).map((row) => row.session_id)).size;
  const elsewhere = new Set(rows.filter((row) => !here.has(row.session_id)).map((row) => row.issue));
  const hereOnly = new Set(rows.filter((row) => here.has(row.session_id) && !elsewhere.has(row.issue)).map((row) => row.issue));
  return { sessions, hereOnly };
}
