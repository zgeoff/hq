import { expect, test } from 'bun:test';
import { buildBurnRate } from './build-burn-rate.ts';

test('it fits the burn in percent per hour by least squares', () => {
  const burn = buildBurnRate([
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 12, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 14, resetsAt: null },
    { at: '2026-10-14T02:30:00Z', percent: 16, resetsAt: null },
  ]);

  expect(burn).toStrictEqual({ samples: 4, latest: 16, ratePerHour: 4, since: '2026-10-14T01:00:00Z' });
});

test('it fits the line through noisy readings, not the first and last alone', () => {
  const burn = buildBurnRate([
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T02:30:00Z', percent: 14, resetsAt: null },
  ]);

  expect(burn.ratePerHour).toBeCloseTo(2.4, 10);
});

test('it uses only the samples after a window reset seen as a reading that falls', () => {
  const burn = buildBurnRate([
    { at: '2026-10-14T01:00:00Z', percent: 80, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 90, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 3, resetsAt: null },
    { at: '2026-10-14T02:30:00Z', percent: 5, resetsAt: null },
    { at: '2026-10-14T03:00:00Z', percent: 7, resetsAt: null },
  ]);

  expect(burn).toStrictEqual({ samples: 3, latest: 7, ratePerHour: 4, since: '2026-10-14T02:00:00Z' });
});

test('it uses only the samples after the reset time moves on', () => {
  const burn = buildBurnRate([
    { at: '2026-10-14T01:00:00Z', percent: 40, resetsAt: '2026-10-14T02:00:00Z' },
    { at: '2026-10-14T01:30:00Z', percent: 60, resetsAt: '2026-10-14T02:00:00Z' },
    { at: '2026-10-14T02:00:00Z', percent: 60, resetsAt: '2026-10-14T07:00:00Z' },
    { at: '2026-10-14T02:30:00Z', percent: 61, resetsAt: '2026-10-14T07:00:00Z' },
    { at: '2026-10-14T03:00:00Z', percent: 62, resetsAt: '2026-10-14T07:00:00Z' },
  ]);

  expect(burn).toStrictEqual({ samples: 3, latest: 62, ratePerHour: 2, since: '2026-10-14T02:00:00Z' });
});

test('it takes a reset time that wobbles by a second for the same window', () => {
  const burn = buildBurnRate([
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: '2026-10-14T07:00:00Z' },
    { at: '2026-10-14T01:30:00Z', percent: 12, resetsAt: '2026-10-14T07:00:01Z' },
    { at: '2026-10-14T02:00:00Z', percent: 14, resetsAt: '2026-10-14T07:00:00Z' },
  ]);

  expect(burn.samples).toBe(3);
});

test('it gives no rate from two samples', () => {
  const burn = buildBurnRate([
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 12, resetsAt: null },
  ]);

  expect(burn).toStrictEqual({ samples: 2, latest: 12, ratePerHour: null, since: '2026-10-14T01:00:00Z' });
});

test('it gives no rate when too few samples follow the reset', () => {
  const burn = buildBurnRate([
    { at: '2026-10-14T01:00:00Z', percent: 80, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 85, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 90, resetsAt: null },
    { at: '2026-10-14T02:30:00Z', percent: 2, resetsAt: null },
  ]);

  expect(burn.ratePerHour).toBeNull();
});

test('it skips a sample with no reading', () => {
  const burn = buildBurnRate([
    { at: '2026-10-14T01:00:00Z', percent: null, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 12, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 14, resetsAt: null },
  ]);

  expect(burn.samples).toBe(2);
});
