import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { readFreshAwake } from '../../areas/read-fresh-awake.ts';
import { fleetIds } from '../../atc/fleet-ids.ts';
import { readDesignRuns } from '../read-design-runs.ts';
import type { DesignRun } from '../read-design-runs.ts';

export interface WorkingCount {
  count: number;

  from: 'sessions' | 'runs';
}

const runsSchema = z.array(z.object({ issue: z.string() }));

const rowsSchema = z.array(z.object({ issue: z.string(), session_id: z.string(), added_at: z.string() }));

export function countWorking(db: Database, at: Date, designRuns: readonly DesignRun[] = readDesignRuns(db)): WorkingCount {
  const design = new Set(designRuns.map((run) => run.issue));
  const reading = readFreshAwake(db, at);
  if (reading === null) {
    const runs = runsSchema.parse(db.query("SELECT issue FROM runs WHERE state = 'working'").all());
    return { count: runs.filter((run) => !design.has(run.issue)).length, from: 'runs' };
  }
  const awake = new Set(reading.ids);
  const fleet = new Set(Object.values(fleetIds(db)));
  const rows = rowsSchema.parse(db.query("SELECT DISTINCT s.issue AS issue, s.session_id AS session_id, s.added_at AS added_at FROM run_sessions s JOIN runs r ON r.issue = s.issue WHERE r.state = 'working' AND s.design_pass = 0").all());
  const seen = reading.seen === undefined ? null : new Set(reading.seen);
  const readAt = Date.parse(reading.at);
  const sessions = new Set(rows.filter((row) => (awake.has(row.session_id) || isUnseen(row, seen, readAt)) && !fleet.has(row.session_id) && !design.has(row.issue)).map((row) => row.session_id));
  return { count: sessions.size, from: 'sessions' };
}

type RunSessionRow = z.output<typeof rowsSchema>[number];

// A session added after the reading is one atc has not looked at, so it counts as awake. Both times
// drop their milliseconds, so a session added in the reading's own second counts unless the reading
// saw it. A reading with no seen list can't tell, and counts only a later second.
function isUnseen(row: RunSessionRow, seen: ReadonlySet<string> | null, readAt: number): boolean {
  const addedAt = Date.parse(row.added_at);
  return seen === null ? addedAt > readAt : addedAt >= readAt && !seen.has(row.session_id);
}
