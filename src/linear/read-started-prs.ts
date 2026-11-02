import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const rowSchema = z.object({ issue: z.string(), ref: z.string(), status: z.string(), merged_at: z.string().nullable() });

// The PRs Linear attached to each In Progress issue at the last read, by issue.
export function readStartedPrs(db: Database): Map<string, { ref: string; status: string; mergedAt: string | null }[]> {
  const byIssue = new Map<string, { ref: string; status: string; mergedAt: string | null }[]>();
  for (const row of z.array(rowSchema).parse(db.query('SELECT issue, ref, status, merged_at FROM linear_started_prs ORDER BY issue, ref').all())) {
    byIssue.set(row.issue, [...(byIssue.get(row.issue) ?? []), { ref: row.ref, status: row.status, mergedAt: row.merged_at }]);
  }
  return byIssue;
}
