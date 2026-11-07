import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const OKReviewSchema = z.object({
  findings: z.string(),
  confirm: z.number(),
  head: z.string().nullable(),
});

export type OKReviewRecord = z.output<typeof OKReviewSchema>;

export function readOKReviews(db: Database, repo: string, pr: number): OKReviewRecord[] {
  const rows = db.query("SELECT findings, confirm, head FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' AND ok = 1 ORDER BY id").all(repo, pr);
  return z.array(OKReviewSchema).parse(rows);
}
