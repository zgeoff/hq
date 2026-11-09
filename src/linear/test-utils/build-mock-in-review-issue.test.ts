import { expect, test } from 'bun:test';
import { buildMockInReviewIssue } from './build-mock-in-review-issue.ts';

test('it builds a default issue In Review', () => {
  expect(buildMockInReviewIssue()).toStrictEqual({ issue: 'GEO-1', updatedAt: '2026-10-14T07:00:00Z' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockInReviewIssue({ issue: 'GEO-9800' })).toStrictEqual({ issue: 'GEO-9800', updatedAt: '2026-10-14T07:00:00Z' });
});
