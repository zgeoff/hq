import type { Database } from "bun:sqlite";
import { z } from "zod";
import { readFreshAwake } from "../../areas/read-fresh-awake.ts";
import { readLaneHolders } from "../../areas/read-lane-holders.ts";
import { RUNNING } from "../../areas/running.ts";
import { fleetIds } from "../../atc/fleet-ids.ts";
import { readDesignRuns } from "../read-design-runs.ts";
import type { DesignRun } from "../read-design-runs.ts";

export interface WorkingCount {
  count: number;

  from: "sessions" | "runs";
}

const runsSchema = z.array(z.object({ issue: z.string() }));

export function countWorking(
  db: Database,
  at: Date,
  designRuns: readonly DesignRun[] = readDesignRuns(db),
): WorkingCount {
  const design = new Set(designRuns.map((run) => run.issue));
  const reading = readFreshAwake(db, at);
  if (reading === null) {
    const runs = runsSchema.parse(
      db
        .query(`SELECT issue FROM runs WHERE state IN (${RUNNING.map(() => "?").join(", ")})`)
        .all(...RUNNING),
    );
    return { count: runs.filter((run) => !design.has(run.issue)).length, from: "runs" };
  }
  const fleet = new Set(Object.values(fleetIds(db)));
  const holders = readLaneHolders(db, reading, at).filter(
    (row) => !fleet.has(row.session_id) && !design.has(row.issue),
  );
  return { count: new Set(holders.map((row) => row.session_id)).size, from: "sessions" };
}
