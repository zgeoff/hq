import { findActiveReviewWait } from './find-active-review-wait.ts';
import type { RunPR } from './types.ts';

export function buildRunPRView(pr: RunPR, at: Date) {
  return { ...pr, review_wait: findActiveReviewWait(pr, at) };
}
