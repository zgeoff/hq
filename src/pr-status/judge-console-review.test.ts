import { expect, test } from 'bun:test';
import { judgeConsoleReview } from './judge-console-review.ts';
import type { ConsoleReviewEvidence } from './judge-console-review.ts';

// An lgtm on widgets#7 at a1b2c3d from console:review-9, and the review evidence that backs it.
function setupTest() {
  return {
    request: { ref: { repo: 'widgets', pr: 7, slug: 'zgeoff/widgets' }, answer: 'lgtm', source: 'console:review-9', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' } as const,
    review: { review: 'lgtm', prURL: 'https://github.com/zgeoff/widgets/pull/7', storedAtHead: true },
  };
}

test('it takes the owner console review of this PR, with this answer, stored at the head now', () => {
  const ctx = setupTest();

  expect(judgeConsoleReview(ctx.request, ctx.review)).toBeNull();
});

test.each([
  ['no review', () => null, 'console:review-9 names no owner review in the console'],
  ['a review of another PR', (review: ConsoleReviewEvidence) => ({ ...review, prURL: 'https://github.com/zgeoff/teapots/pull/7' }), "console:review-9 is not the owner's console review of zgeoff/widgets#7"],
  ['a review with no PR', (review: ConsoleReviewEvidence) => ({ ...review, prURL: null }), "console:review-9 is not the owner's console review of zgeoff/widgets#7"],
  ['another answer', (review: ConsoleReviewEvidence) => ({ ...review, review: 'reject' }), "the owner's console review console:review-9 is reject, not lgtm"],
  ['no record at the head now', (review: ConsoleReviewEvidence) => ({ ...review, storedAtHead: false }), 'the console stored console:review-9 at no head or another head, not a1b2c3d, the head gh gives now'],
])('it refuses %s', (_label, change: (review: ConsoleReviewEvidence) => ConsoleReviewEvidence | null, why) => {
  const ctx = setupTest();

  expect(judgeConsoleReview(ctx.request, change(ctx.review))).toBe(why);
});
