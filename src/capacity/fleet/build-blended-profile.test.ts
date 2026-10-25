import { expect, test } from 'bun:test';
import { buildMockBurnDay } from '../../../test/build-mock-burn-day.ts';
import type { BurnPoint } from '../build-burn-rate.ts';
import { buildBlendedProfile } from './build-blended-profile.ts';
import { buildLaneFactor } from './build-lane-factor.ts';
import { makeLanesAt } from './make-lanes-at.ts';

test('it blends a steep daytime slope with the mean of the hour of the day for the first 2 hours', () => {
  const active: BurnPoint[] = [
    { at: '2026-10-14T03:00:00Z', percent: 32, resetsAt: null },
    { at: '2026-10-14T03:30:00Z', percent: 36, resetsAt: null },
    { at: '2026-10-14T04:00:00Z', percent: 40, resetsAt: null },
    { at: '2026-10-14T04:30:00Z', percent: 44, resetsAt: null },
    { at: '2026-10-14T05:00:00Z', percent: 48, resetsAt: null },
  ];

  const profile = buildBlendedProfile(active, [buildMockBurnDay()], new Date('2026-10-14T05:00:00Z'), () => 1);

  expect(profile?.rateAt(new Date('2026-10-14T05:00:00Z'))).toBeCloseTo(6.2, 6);
  expect(profile?.rateAt(new Date('2026-10-14T06:45:00Z'))).toBeCloseTo(6.2, 6);
});

test('it drops a steep daytime slope from 2 hours on and uses the low night mean of the hour alone', () => {
  const active: BurnPoint[] = [
    { at: '2026-10-14T03:00:00Z', percent: 32, resetsAt: null },
    { at: '2026-10-14T03:30:00Z', percent: 36, resetsAt: null },
    { at: '2026-10-14T04:00:00Z', percent: 40, resetsAt: null },
    { at: '2026-10-14T04:30:00Z', percent: 44, resetsAt: null },
    { at: '2026-10-14T05:00:00Z', percent: 48, resetsAt: null },
  ];

  const profile = buildBlendedProfile(active, [buildMockBurnDay()], new Date('2026-10-14T05:00:00Z'), () => 1);

  expect(profile?.rateAt(new Date('2026-10-14T07:00:00Z'))).toBeCloseTo(0.7, 6);
  expect(profile?.rateAt(new Date('2026-10-14T16:00:00Z'))).toBeCloseTo(0.7, 6);
  expect(profile?.rateAt(new Date('2026-10-15T01:00:00Z'))).toBeCloseTo(4.4, 6);
});

test('it uses the hourly mean alone when the last 2 hours have no points', () => {
  const profile = buildBlendedProfile(buildMockBurnDay(), [buildMockBurnDay()], new Date('2026-10-17T12:30:00Z'), () => 1);

  expect(profile?.rateAt(new Date('2026-10-17T12:30:00Z'))).toBeCloseTo(0.7, 6);
  expect(profile?.rateAt(new Date('2026-10-18T01:00:00Z'))).toBeCloseTo(4.4, 6);
});

test('it falls back to the recent slope for a later hour with no mean', () => {
  const active: BurnPoint[] = [
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 12, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 14, resetsAt: null },
    { at: '2026-10-14T02:30:00Z', percent: 16, resetsAt: null },
  ];
  const earlier: BurnPoint[] = [
    { at: '2026-10-13T01:00:00Z', percent: 50, resetsAt: null },
    { at: '2026-10-13T01:30:00Z', percent: 50.5, resetsAt: null },
  ];

  const profile = buildBlendedProfile(active, [earlier], new Date('2026-10-14T02:30:00Z'), () => 1);

  expect(profile?.rateAt(new Date('2026-10-14T16:00:00Z'))).toBeCloseTo(4, 6);
  expect(profile?.rateAt(new Date('2026-10-15T01:00:00Z'))).toBeCloseTo(1, 6);
});

test('it uses the recent slope alone in the first 2 hours for an hour with no mean', () => {
  const active: BurnPoint[] = [
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 12, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 14, resetsAt: null },
    { at: '2026-10-14T02:30:00Z', percent: 16, resetsAt: null },
  ];
  const earlier: BurnPoint[] = [
    { at: '2026-10-13T01:00:00Z', percent: 50, resetsAt: null },
    { at: '2026-10-13T01:30:00Z', percent: 50.5, resetsAt: null },
  ];

  const profile = buildBlendedProfile(active, [earlier], new Date('2026-10-14T02:30:00Z'), () => 1);

  expect(profile?.rateAt(new Date('2026-10-14T03:30:00Z'))).toBeCloseTo(4, 6);
});

test('it takes the recent slope from the active points alone and the hourly mean from every account', () => {
  const active: BurnPoint[] = [
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 11, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 12, resetsAt: null },
  ];
  const earlier: BurnPoint[] = [
    { at: '2026-10-13T15:00:00Z', percent: 60, resetsAt: null },
    { at: '2026-10-13T15:30:00Z', percent: 63, resetsAt: null },
  ];

  const profile = buildBlendedProfile(active, [earlier, active], new Date('2026-10-14T02:00:00Z'), () => 1);

  expect(profile?.rateAt(new Date('2026-10-14T02:00:00Z'))).toBeCloseTo(2, 6);
  expect(profile?.rateAt(new Date('2026-10-14T15:00:00Z'))).toBeCloseTo(6, 6);
});

test('it scales each recent interval from the lanes in force for it when the lanes change at the newest point', () => {
  const active: BurnPoint[] = [
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 11.5, resetsAt: null },
    { at: '2026-10-14T02:00:00Z', percent: 13, resetsAt: null },
  ];
  const lanesAt = makeLanesAt([
    { at: '2026-10-14T01:00:00Z', slot: 1, status: '200', five: 10, fiveResetsAt: null, seven: 20, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 },
    { at: '2026-10-14T02:00:00Z', slot: 1, status: '200', five: 13, fiveResetsAt: null, seven: 21, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 4 },
  ]);

  const profile = buildBlendedProfile(active, [], new Date('2026-10-14T02:00:00Z'), (time) => buildLaneFactor({ kind: 'fit', fit: { base: 1, perLane: 1 } }, lanesAt(time), 4));

  expect(profile?.rateAt(new Date('2026-10-14T02:00:00Z'))).toBeCloseTo(5, 6);
});

test('it gives no profile when there are no points', () => {
  expect(buildBlendedProfile([], [], new Date('2026-10-14T02:30:00Z'), () => 1)).toBeNull();
});
