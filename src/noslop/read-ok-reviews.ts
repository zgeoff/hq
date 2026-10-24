import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const OKReviewSchema = z.object({
  findings: z.string(),
  confirm: z.number(),
});

export type OKReviewRecord = z.output<typeof OKReviewSchema>;

// The PR's noslop reviews that ran, oldest first. A failed review and a check are not rounds. `findings`
// is the JSON noslop_rounds.findings stores; `confirm` is 1 on a fix-checks-only run, which is not a round.
export function readOKReviews(db: Database, repo: string, pr: number): OKReviewRecord[] {
  const rows = db.query("SELECT findings, confirm FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' AND ok = 1 ORDER BY id").all(repo, pr);
  return z.array(OKReviewSchema).parse(rows);
}
