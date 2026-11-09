import { findActiveReviewWait } from './find-active-review-wait.ts';
import type { RunPr } from './types.ts';

export function buildRunPRView(pr: RunPr, at: Date) {
  return { ...pr, review_wait: findActiveReviewWait(pr, at) };
}
