import { expect, test } from 'bun:test';
import { findReviewTimeoutRefusal } from './find-review-timeout-refusal.ts';

test.each([undefined, '1', '40', '60'])('it takes --timeout %p', (raw) => {
  expect(findReviewTimeoutRefusal(raw)).toBeNull();
});

test.each(['61', '600', '0', '1.5', '-5', '', 'ten'])('it refuses --timeout %p: past the cap, below a minute, or not a whole number', (raw) => {
  expect(findReviewTimeoutRefusal(raw)).toBe(`--timeout takes whole minutes from 1 to 60, not "${raw}"`);
});
