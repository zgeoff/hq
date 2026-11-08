import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { parkedRuns } from './parked-runs.ts';
import { RUNNING } from './running.ts';

const LaneCountSchema = z.object({ lane: z.string(), count: z.number() });

export function runningByLane(db: Database, at: Date = now()): Record<string, number> {
  const query = sql`SELECT COALESCE(lane, '') AS lane, COUNT(*) AS count FROM runs WHERE place != 'none' AND state IN (${sql.join(RUNNING)}) GROUP BY 1`.compile(kdb(db));
  const rows = runSyncQuery(db, query, LaneCountSchema);
  const out = Object.fromEntries(rows.map((row) => [row.lane, row.count]));
  for (const parked of parkedRuns(db, at)) {
    out[parked.lane] = Math.max(0, (out[parked.lane] ?? 0) - 1);
  }
  return out;
}
