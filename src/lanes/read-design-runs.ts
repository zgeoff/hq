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
}

const runsSchema = z.array(z.object({ issue: z.string(), state: z.enum(RUN_STATES), design_lane: z.enum(DESIGN_LANES).nullable() }));

const movedSchema = z.array(z.object({ subject_id: z.string() }));

// A run added before v46 has no design_lane; one whose issue is type Design counts as with-geoff.
export function readDesignRuns(db: Database): DesignRun[] {
  const rows = runsSchema.parse(db.query('SELECT issue, state, design_lane FROM runs').all());
  const designIssues = readDesignIssues(db);
  const built = new Set(movedSchema.parse(db.query("SELECT DISTINCT subject_id FROM events WHERE subject = 'run' AND action = 'design-to-build'").all()).map((row) => row.subject_id));
  return rows.flatMap((row): DesignRun[] => {
    const lane = row.design_lane ?? (designIssues.has(row.issue) && !built.has(row.issue) ? 'with-geoff' : null);
    return lane === null ? [] : [{ issue: row.issue, state: row.state, lane }];
  });
}
