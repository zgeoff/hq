import { expect, test } from 'bun:test';
import { buildActionsBudget } from './build-actions-budget.ts';

test.each([
  ['the first day of a 30-day month', '2026-11-01T00:00:00Z', 50 / 30],
  ['a middle day of a 30-day month', '2026-11-15T12:00:00Z', 25],
  ['the last day of a 30-day month', '2026-11-30T23:59:59Z', 50],
  ['the first day of a 31-day month', '2026-10-01T00:00:00Z', 50 / 31],
  ['a middle day of a 31-day month', '2026-10-16T07:00:00Z', (50 * 16) / 31],
  ['the last day of a 31-day month', '2026-10-31T23:59:59Z', 50],
  ['a UTC last day that is already the next month in Sydney', '2026-11-30T14:00:00Z', 50],
])('it pro-rates $50 a month by the UTC days elapsed on %s', (_label, at, budget) => {
  expect(buildActionsBudget(50, new Date(at))).toBeCloseTo(budget, 10);
});
