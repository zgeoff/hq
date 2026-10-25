import { expect, test } from 'bun:test';
import { buildMockBurnDay } from './build-mock-burn-day.ts';

test('it builds 48 half-hourly points that rise faster by day than by night', () => {
  const points = buildMockBurnDay();

  expect(points).toHaveLength(48);
  expect(points[0]).toStrictEqual({ at: '2026-10-13T13:00:00Z', percent: 0, resetsAt: null });
  expect(points[1]?.percent).toBeCloseTo(0.35, 9);
  expect(points[25]?.percent).toBeCloseTo(0.7 * 8 + 4.4 * 4.5, 9);
});
