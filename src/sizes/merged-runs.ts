import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { z } from 'zod';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { RunPrSchema } from '../runs/run-pr-schema.ts';
import { RunSchema } from '../runs/run-schema.ts';
import { getCutoff as cutoff } from '../stats/get-cutoff.ts';
import type { SizedRun } from './types.ts';

const MergedRunSchema = RunSchema.pick({ issue: true, size: true, size_lines: true }).extend({ lastMerge: z.string() });
const MergedPrSchema = RunPrSchema.pick({ ref: true, url: true });

export function mergedRuns(db: Database, from: string, to: string): SizedRun[] {
  const lo = from < cutoff() ? cutoff() : from;
  const query = sql`SELECT r.issue, r.size, r.size_lines, MAX(p.merged_at) AS lastMerge
       FROM runs r JOIN run_prs p ON p.issue = r.issue AND p.state = 'merged' AND p.merged_at IS NOT NULL AND p.design_pass = 0
       WHERE r.created_at >= ${cutoff()} AND r.state IN ('merged', 'deploying', 'deploy-held', 'live-check', 'done')
         AND NOT EXISTS (SELECT 1 FROM run_prs o WHERE o.issue = r.issue AND o.state = 'open' AND o.design_pass = 0)
       GROUP BY r.issue HAVING lastMerge >= ${lo} AND lastMerge < ${to} ORDER BY lastMerge`.compile(kdb(db));
  const rows = runSyncQuery(db, query, MergedRunSchema);
  return rows.map((row) => {
    const prs = kdb(db).selectFrom('run_prs').select(['ref', 'url']).where('issue', '=', row.issue).where('state', '=', 'merged').where('design_pass', '=', 0).orderBy('ref').compile();
    return { issue: row.issue, size: row.size, size_lines: row.size_lines, lastMerge: row.lastMerge, prs: runSyncQuery(db, prs, MergedPrSchema) };
  });
}
