import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../../clock/iso.ts';
import type { FiledIssue } from './types.ts';

const filedRowSchema = z.object({
  issue: z.string(),
  source: z.enum(['owner', 'design', 'agent', 'live check', 'bot']),
  pr_ref: z.string().nullable(),
  recorded: z.number(),
});

// The issues filed in [from, at); one z-review recorded as a follow-up is a review one, whatever
// Linear shows.
export function readFiledIssues(db: Database, from: Date, at: Date): FiledIssue[] {
  const rows = db
    .query(
      `SELECT f.issue, f.source, f.pr_ref, EXISTS (SELECT 1 FROM followups u WHERE u.issue = f.issue) AS recorded
       FROM linear_filed f WHERE f.created_at >= ? AND f.created_at < ? ORDER BY f.created_at, f.issue`,
    )
    .all(iso(from), iso(at));
  return z
    .array(filedRowSchema)
    .parse(rows)
    .map((row) => ({ issue: row.issue, source: row.recorded ? 'review' : row.source, prRef: row.pr_ref }));
}
