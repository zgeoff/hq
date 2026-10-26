import { expect, test } from 'bun:test';
import { parseReviewTimeout } from './parse-review-timeout.ts';

test('it gives a noslop run 15 minutes when --timeout is unset', () => {
  expect(parseReviewTimeout(undefined)).toBe(900_000);
});

test('it reads --timeout as whole minutes', () => {
  expect(parseReviewTimeout('1')).toBe(60_000);
  expect(parseReviewTimeout('40')).toBe(2_400_000);
  expect(parseReviewTimeout('60')).toBe(3_600_000);
});
