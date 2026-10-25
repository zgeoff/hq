import { expect, test } from 'bun:test';
import { getSydneyParts } from '../../clock/get-sydney-parts.ts';
import { iso } from '../../clock/iso.ts';
import type { BurnPoint } from '../build-burn-rate.ts';
import { buildBlendedProfile } from './build-blended-profile.ts';

// One day of half-hourly points from Sydney midnight of 14 Oct 2026: 0.7 points an hour from
// 18:00 to 08:00 and 4.4 an hour by day.
function buildDay(): BurnPoint[] {
  const points: BurnPoint[] = [];
  let percent = 0;
  for (let step = 0; step < 48; step += 1) {
    const time = new Date(Date.parse('2026-10-13T13:00:00Z') + step * 1_800_000);
    const hour = getSydneyParts(time).hour;

    points.push({ at: iso(time), percent, resetsAt: null });
    percent += (hour >= 8 && hour < 18 ? 4.4 : 0.7) * 0.5;
  }
  return points;
}

test('it blends the slope of the last 2 hours with the mean of each hour of the day', () => {
  const profile = buildBlendedProfile(buildDay(), new Date('2026-10-14T12:30:00Z'));

  expect(profile?.[12]).toBeCloseTo(2.55, 6);
  expect(profile?.[3]).toBeCloseTo(0.7, 6);
});

test('it uses the hourly mean alone when the last 2 hours have no points', () => {
  const profile = buildBlendedProfile(buildDay(), new Date('2026-10-17T12:30:00Z'));

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
