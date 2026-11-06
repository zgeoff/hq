import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { readFreshAwake } from './read-fresh-awake.ts';
import { readLaneHolders } from './read-lane-holders.ts';
import { RUNNING } from './running.ts';

const runLaneRows = z.array(z.object({ issue: z.string(), lane: z.string() }));

export function parkedRuns(db: Database, at: Date = now()): { issue: string; lane: string }[] {
  const reading = readFreshAwake(db, at);
  if (reading === null) {
    return [];
  }
  const holding = new Set(readLaneHolders(db, reading, at).map((row) => row.issue));
  const runs = runLaneRows.parse(db.query(`SELECT issue, COALESCE(lane, '') AS lane FROM runs WHERE place != 'none' AND state IN (${RUNNING.map(() => '?').join(', ')}) ORDER BY issue`).all(...RUNNING));
  return runs.filter((run) => !holding.has(run.issue));
}
