import { Database } from 'bun:sqlite';
import { z } from 'zod';
import { parseJSON } from './parse-json.ts';

const PrintedReviewSchema = z.object({ reviewID: z.string(), head: z.string() });

// Whether noslop's store holds the review that a run printed, at the head it printed. A store that
// cannot be read, or has no reviews table yet, holds no review.
export function probeStoredReview(store: string, stdout: string): boolean {
  const printed = PrintedReviewSchema.safeParse(parseJSON(stdout));
  if (!printed.success) {
    return false;
  }
  try {
    const db = new Database(store, { readonly: true });
    try {
      return db.query('SELECT 1 FROM reviews WHERE review_id = ? AND head = ?').get(printed.data.reviewID, printed.data.head) !== null;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}
