import { expect, test } from 'bun:test';
import { pickScheduledReason } from './pick-scheduled-reason.ts';

test.each<[string, number, number | null, string | null]>([
  ['six hours with no transcript read', 21_600_000, null, '6 h since start'],
  ['six hours and three compactions', 21_600_000, 3, '6 h since start'],
  ['just under six hours with no transcript read', 21_599_999, null, null],
  ['one hour and three compactions', 3_600_000, 3, '3 compactions since start'],
  ['five hours and two compactions', 18_000_000, 2, null],
  ['one hour and no compactions', 3_600_000, 0, null],
])('it picks the reason for %s', (_, ageMs, compactions, expected) => {
  expect(pickScheduledReason(ageMs, compactions)).toBe(expected);
});
