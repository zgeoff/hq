import type { RunPr } from './types.ts';

export type ReviewWait = Pick<RunPr, 'final_sha' | 'review_wait_until' | 'review_wait_sha'>;

// A wait belongs to the FINAL it was set on, so a new FINAL at another head ends it.
export function isReviewWaitActive(pr: ReviewWait, at: Date): boolean {
  if (pr.review_wait_until === null || pr.review_wait_sha === null || pr.final_sha === null) {
    return false;
  }
  return pr.review_wait_sha === pr.final_sha && Date.parse(pr.review_wait_until) > at.getTime();
}
