import { expect, test } from 'bun:test';
import { parseReviewTimeout } from './parse-review-timeout.ts';

test('it gives a noslop run 15 minutes when --timeout is unset', () => {
  expect(parseReviewTimeout(undefined)).toBe(900_000);
});

test('it reads --timeout as whole minutes, up to the 60 minute cap', () => {
  expect(parseReviewTimeout('1')).toBe(60_000);
  expect(parseReviewTimeout('40')).toBe(2_400_000);
  expect(parseReviewTimeout('60')).toBe(3_600_000);
});

test('it refuses a --timeout past the cap, below a minute, or not a whole number', () => {
  for (const raw of ['61', '600', '0', '1.5', '-5', '', 'ten']) {
    expect(() => parseReviewTimeout(raw)).toThrow(expect.objectContaining({ code: 'bad_args' }));
  }
});
