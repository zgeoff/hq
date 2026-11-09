import { buildReviewWait } from './build-review-wait.ts';
import type { RunPr } from './types.ts';

export function buildRunPrView(pr: RunPr, at: Date) {
  return { ...pr, review_wait: buildReviewWait(pr, at) };
}
