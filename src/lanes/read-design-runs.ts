import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { RUN_STATES } from '../transitions/run-states.ts';
import type { RunState } from '../transitions/run-states.ts';
import { DESIGN_LANES } from './design-lane.ts';
import type { DesignLane } from './design-lane.ts';
import { readDesignIssues } from './read-design-issues.ts';

export interface DesignRun {
  issue: string;
  state: RunState;
  lane: DesignLane;

  // The run's own design_lane; null for a run added before v46 that counts as with-geoff by its issue's type.
  designLane: DesignLane | null;
}

const runsSchema = z.array(z.object({ issue: z.string(), state: z.enum(RUN_STATES), design_lane: z.enum(DESIGN_LANES).nullable() }));

const movedSchema = z.array(z.object({ subject_id: z.string() }));

// Every run that is a design pass, open or closed: one with a design_lane, and a run added before v46
// (no design_lane) whose issue is type Design, which counts as with-geoff. A run that turned into the
// build run after its design pass is a delivery run, whatever its issue's type.
export function readDesignRuns(db: Database): DesignRun[] {
  const rows = runsSchema.parse(db.query('SELECT issue, state, design_lane FROM runs').all());
  const designIssues = readDesignIssues(db);
  const built = new Set(movedSchema.parse(db.query("SELECT DISTINCT subject_id FROM events WHERE subject = 'run' AND action = 'design-to-build'").all()).map((row) => row.subject_id));
  return rows.flatMap((row): DesignRun[] => {
    const lane = row.design_lane ?? (designIssues.has(row.issue) && !built.has(row.issue) ? 'with-geoff' : null);
    return lane === null ? [] : [{ issue: row.issue, state: row.state, lane, designLane: row.design_lane }];
  });
}
