import type { InReviewIssue } from '../write-in-review.ts';

export function buildMockInReviewIssue(overrides: Partial<InReviewIssue> = {}): InReviewIssue {
  return { issue: 'GEO-1', updatedAt: '2026-10-14T07:00:00Z', ...overrides };
}
