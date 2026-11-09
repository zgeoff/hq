import { formatCapUntil } from '../lanes/cap/format-cap-until.ts';
import { isReviewWaitActive } from './is-review-wait-active.ts';
import type { ReviewWait } from './is-review-wait-active.ts';
import type { RunPr } from './types.ts';

export function formatReviewWait(pr: ReviewWait & Pick<RunPr, 'review_wait_reason'>, at: Date): string | null {
  if (!isReviewWaitActive(pr, at) || pr.review_wait_until === null) {
    return null;
  }
  return `review waits until ${formatCapUntil(pr.review_wait_until, { withDate: true })} Sydney (${pr.review_wait_reason ?? 'no reason'})`;
}
