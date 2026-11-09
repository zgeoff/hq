import type { RunPR } from './types.ts';

export interface ActiveReviewWait {
  until: string;
  reason: string | null;
  sha: string;
}

// A wait belongs to the FINAL it was set on, so a new FINAL at another head ends it.
export function findActiveReviewWait(pr: Pick<RunPR, 'final_sha' | 'review_wait_until' | 'review_wait_sha' | 'review_wait_reason'>, at: Date): ActiveReviewWait | null {
  if (pr.review_wait_until === null || pr.review_wait_sha === null || pr.review_wait_sha !== pr.final_sha || Date.parse(pr.review_wait_until) <= at.getTime()) {
    return null;
  }
  return { until: pr.review_wait_until, reason: pr.review_wait_reason, sha: pr.review_wait_sha };
}
