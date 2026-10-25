import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const ReviewRoundEndSchema = z.object({ ok: z.number(), head: z.string().nullable(), base_move: z.number() }).nullable();

export type ReviewRoundEnd = NonNullable<z.output<typeof ReviewRoundEndSchema>>;

// The newest review round of the PR, lens or --fixes-only, ok or not; null when there is none.
export function findLastReviewRound(db: Database, repo: string, pr: number): ReviewRoundEnd | null {
  return ReviewRoundEndSchema.parse(db.query("SELECT ok, head, base_move FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' ORDER BY id DESC LIMIT 1").get(repo, pr) ?? null);
}
