import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { DESIGN_LANES } from '../lanes/design-lane.ts';
import type { DesignLane } from '../lanes/design-lane.ts';

const movesSchema = z.array(z.object({ at: z.string(), data: z.string() }));

const dataSchema = z.object({ designLane: z.enum(DESIGN_LANES), designSessions: z.array(z.string()) });

export interface DesignMove {
  at: string;
  designLane: DesignLane;
  designSessions: string[];
}

// The times a run turned from its design pass into the build run, oldest first, each with the design
// lane and the sessions that held the pass.
export function readDesignMoves(db: Database, issue: string): DesignMove[] {
  const rows = movesSchema.parse(db.query("SELECT at, data FROM events WHERE subject = 'run' AND subject_id = ? AND action = 'design-to-build' ORDER BY seq").all(issue));
  return rows.map((row) => {
    const data = dataSchema.parse(JSON.parse(row.data));
    return { at: row.at, designLane: data.designLane, designSessions: data.designSessions };
  });
}
