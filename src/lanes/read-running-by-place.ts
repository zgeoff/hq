import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { parkedRuns } from '../areas/parked-runs.ts';
import { readFreshAwake } from '../areas/read-fresh-awake.ts';
import { RUNNING } from '../areas/running.ts';
import { now } from '../clock/now.ts';

export interface RunningByPlace {
  imp: number;
  local: number;

  // The running issues that hold a slot, parked ones left out.
  issues: string[];

  // Why local is more than the runs filed local hold, or null when those runs set it.
  localSource: string | null;
}

const rowsSchema = z.array(z.object({ issue: z.string(), place: z.enum(['imp', 'local']) }));

// The runs that hold a slot now, by where they run: working or blocked with an agent, less the
// parked ones (a blocked run with no session awake, a working run whose sessions are gone). With a
// fresh atc reading, local is at least the awake sessions on this PC that any run lists, whatever the
// run's state, place or lane, and a run filed imp whose awake sessions are all here counts local only.
export function readRunningByPlace(db: Database, at: Date = now()): RunningByPlace {
  const parked = new Set(parkedRuns(db, at).map((run) => run.issue));
  const rows = rowsSchema.parse(db.query(`SELECT issue, place FROM runs WHERE place != 'none' AND state IN (${RUNNING.map(() => '?').join(', ')}) ORDER BY issue`).all(...RUNNING));
  const holding = rows.filter((row) => !parked.has(row.issue));
  const filedLocal = holding.filter((row) => row.place === 'local').length;
  const live = readLiveLocal(db, at);
  const imp = holding.filter((row) => row.place === 'imp' && !live?.hereOnly.has(row.issue)).length;
  const issues = holding.map((row) => row.issue);
  if (live === null || live.sessions <= filedLocal) {
    return { imp, local: filedLocal, issues, localSource: null };
  }
  const plural = live.sessions === 1 ? '' : 's';
  return { imp, local: live.sessions, issues, localSource: `${live.sessions} live session${plural} here` };
}

interface LiveLocal {
  sessions: number;

  // The runs whose awake sessions all run on this PC.
  hereOnly: Set<string>;
}

const sessionsSchema = z.array(z.object({ issue: z.string(), session_id: z.string() }));

// Null with no fresh reading, or one from before the sweep recorded the local sessions.
function readLiveLocal(db: Database, at: Date): LiveLocal | null {
  const reading = readFreshAwake(db, at);
  if (reading?.local === undefined) {
    return null;
  }
  const awake = new Set(reading.ids);
  const here = new Set(reading.local);
  const rows = sessionsSchema.parse(db.query('SELECT DISTINCT issue, session_id FROM run_sessions').all()).filter((row) => awake.has(row.session_id));
  const sessions = new Set(rows.filter((row) => here.has(row.session_id)).map((row) => row.session_id)).size;
  const elsewhere = new Set(rows.filter((row) => !here.has(row.session_id)).map((row) => row.issue));
  const hereOnly = new Set(rows.filter((row) => here.has(row.session_id) && !elsewhere.has(row.issue)).map((row) => row.issue));
  return { sessions, hereOnly };
}
