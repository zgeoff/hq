import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../../clock/iso.ts';
import { Z_SESSIONS } from '../../linear/z-sessions.ts';
import { pickIssueSource } from './pick-issue-source.ts';
import type { FiledIssue } from './types.ts';

const filedRowSchema = z.object({
  issue: z.string(),
  source: z.string(),
  pr_ref: z.string().nullable(),
  recorded: z.number(),
});

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
    .map((row) => ({ issue: row.issue, source: pickIssueSource(row.source, row.recorded === 1, Z_SESSIONS), prRef: row.pr_ref }));
}
