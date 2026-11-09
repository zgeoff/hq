import { isReviewWaitActive } from './is-review-wait-active.ts';
import type { ReviewWait } from './is-review-wait-active.ts';
import type { RunPr } from './types.ts';

export interface ActiveReviewWait {
  until: string;
  reason: string | null;
}

export function buildReviewWait(pr: ReviewWait & Pick<RunPr, 'review_wait_reason'>, at: Date): ActiveReviewWait | null {
  if (!isReviewWaitActive(pr, at) || pr.review_wait_until === null) {
    return null;
  }
  return { until: pr.review_wait_until, reason: pr.review_wait_reason };
}
