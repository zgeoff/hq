import { expect, test } from 'bun:test';
import { buildMockBurnDay } from '../../../test/build-mock-burn-day.ts';
import type { BurnPoint } from '../build-burn-rate.ts';
import { buildBlendedProfile } from './build-blended-profile.ts';

test('it blends the slope of the last 2 hours with the mean of each hour of the day', () => {
  const profile = buildBlendedProfile(buildMockBurnDay(), new Date('2026-10-14T12:30:00Z'));

  expect(profile?.[12]).toBeCloseTo(2.55, 6);
  expect(profile?.[3]).toBeCloseTo(0.7, 6);
});

test('it uses the hourly mean alone when the last 2 hours have no points', () => {
  const profile = buildBlendedProfile(buildMockBurnDay(), new Date('2026-10-17T12:30:00Z'));

  expect(profile?.[12]).toBeCloseTo(4.4, 6);
  expect(profile?.[3]).toBeCloseTo(0.7, 6);
});

test('it uses the recent slope alone for an hour with no history', () => {
  const points: BurnPoint[] = [
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 12, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 14, resetsAt: null },
    { at: '2026-10-14T02:30:00Z', percent: 16, resetsAt: null },
  ];

  const profile = buildBlendedProfile(points, new Date('2026-10-14T02:30:00Z'));

  expect(profile?.[3]).toBeCloseTo(4, 6);
});

test('it gives no profile when there are no points', () => {
  expect(buildBlendedProfile([], new Date('2026-10-14T02:30:00Z'))).toBeNull();
});
