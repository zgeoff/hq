import { formatCapUntil } from '../lanes/cap/format-cap-until.ts';
import type { ActiveReviewWait } from './find-active-review-wait.ts';

export function formatReviewWait(wait: ActiveReviewWait): string {
  return `review waits until ${formatCapUntil(wait.until, { withDate: true })} Sydney (${wait.reason ?? 'no reason'})`;
}
