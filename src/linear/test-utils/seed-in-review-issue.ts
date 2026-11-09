import type { InReviewIssue } from '../write-in-review.ts';
import { writeInReview } from '../write-in-review.ts';
import { buildMockInReviewIssue } from './build-mock-in-review-issue.ts';
import type { LinearDeps } from './types.ts';

export interface InReviewIssueInput extends InReviewIssue {
  fetchedAt: string;
}

// The sync stores the whole In Review list at once, so this seed leaves one issue In Review.
export function seedInReviewIssue(deps: LinearDeps, input: Partial<InReviewIssueInput> = {}): InReviewIssue {
  const { fetchedAt = '2026-10-15T07:00:00Z', ...issueInput } = input;
  const issue = buildMockInReviewIssue(issueInput);
  writeInReview(deps.db, [issue], new Date(fetchedAt));

  return issue;
}
