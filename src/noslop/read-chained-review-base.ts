import type { Database } from 'bun:sqlite';
import { z } from 'zod';

export interface ReviewedPR {
  db: Database;
  repo: string;
  pr: number;
}

// A review that read only the commits since an earlier review of the same PR records that review's
// head as its base. The commits it stands for reach back to the base of the first review in the chain.
export function readChainedReviewBase(reviewed: ReviewedPR, base: string, seen: ReadonlySet<string> = new Set()): string {
  const earlier = seen.has(base) ? null : findReviewBaseAt(reviewed, base);
  return earlier === null ? base : readChainedReviewBase(reviewed, earlier, new Set([...seen, base]));
}

const BaseRow = z.object({ base: z.string() });

function findReviewBaseAt(reviewed: ReviewedPR, head: string): string | null {
  const row = reviewed.db.query("SELECT base FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' AND ok = 1 AND head = ? AND base IS NOT NULL ORDER BY id DESC LIMIT 1").get(reviewed.repo, reviewed.pr, head);
  const parsed = BaseRow.safeParse(row);
  return parsed.success ? parsed.data.base : null;
}
