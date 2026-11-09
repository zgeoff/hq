import { TZ } from '../clock/tz.ts';
import { isReviewWaitActive } from './is-review-wait-active.ts';
import type { ReviewWait } from './is-review-wait-active.ts';
import type { RunPr } from './types.ts';

export function formatReviewWait(pr: ReviewWait & Pick<RunPr, 'review_wait_reason'>, at: Date): string | null {
  if (!isReviewWaitActive(pr, at) || pr.review_wait_until === null) {
    return null;
  }
  const time = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(pr.review_wait_until));
  return `review waits until ${time} (${pr.review_wait_reason ?? 'no reason'})`;
}
