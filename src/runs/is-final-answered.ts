import { sameSha } from './same-sha.ts';
import type { RunPr } from './types.ts';

export type FinalMarks = Pick<RunPr, 'final_sha' | 'final_at' | 'review_started_at' | 'reviewed_sha' | 'reviewed_at'>;

// hq keeps no commit order, so time decides when the shas differ. A review round reads the head
// it starts at: a finished round that started after the FINAL read that head or a newer one. The
// marks keep whole seconds, so a review in the FINAL's own second may have come first: it counts not.
export function isFinalAnswered(pr: FinalMarks): boolean {
  if (sameSha(pr.reviewed_sha, pr.final_sha)) {
    return true;
  }
  if (pr.final_at === null || pr.reviewed_at === null) {
    return false;
  }
  if (pr.review_started_at === null) {
    return pr.reviewed_at > pr.final_at;
  }
  return pr.review_started_at > pr.final_at && pr.reviewed_at >= pr.review_started_at;
}
