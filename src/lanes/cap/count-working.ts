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

const rowsSchema = z.array(z.object({ issue: z.string(), session_id: z.string() }));

export function countWorking(db: Database, at: Date, designRuns: readonly DesignRun[] = readDesignRuns(db)): WorkingCount {
  const design = new Set(designRuns.map((run) => run.issue));
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
