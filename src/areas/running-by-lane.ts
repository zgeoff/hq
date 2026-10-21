import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { parkedRuns } from './parked-runs.ts';
import { RUNNING } from './running.ts';

export function runningByLane(db: Database, at: Date = now()): Record<string, number> {
  const rows = db.query(`SELECT COALESCE(lane, '') AS lane, COUNT(*) AS n FROM runs WHERE place != 'none' AND state IN (${RUNNING.map(() => '?').join(', ')}) GROUP BY 1`).all(...RUNNING) as { lane: string; n: number }[];
  const out = Object.fromEntries(rows.map((r) => [r.lane, r.n]));
  for (const p of parkedRuns(db, at)) out[p.lane] = Math.max(0, (out[p.lane] ?? 0) - 1);
  return out;
}
