import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { parkedRuns } from './parked-runs.ts';
import { RUNNING } from './running.ts';

const LaneCountSchema = z.object({ lane: z.string(), n: z.number() });

export function runningByLane(db: Database, at: Date = now()): Record<string, number> {
  const query = sql`SELECT COALESCE(lane, '') AS lane, COUNT(*) AS n FROM runs WHERE place != 'none' AND state IN (${sql.join(RUNNING)}) GROUP BY 1`.compile(kdb(db));
  const rows = runSyncQuery(db, query, LaneCountSchema);
  const out = Object.fromEntries(rows.map((r) => [r.lane, r.n]));
  for (const p of parkedRuns(db, at)) out[p.lane] = Math.max(0, (out[p.lane] ?? 0) - 1);
  return out;
}
