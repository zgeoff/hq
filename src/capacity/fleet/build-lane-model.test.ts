import { expect, test } from 'bun:test';
import { buildLaneFactor } from './build-lane-factor.ts';
import { buildLaneModel } from './build-lane-model.ts';

test('it scales linearly by lane count when the reads span under 7 days', () => {
  const model = buildLaneModel('2026-10-10T00:00:00Z', [
    { lanes: 0, rate: 1 },
    { lanes: 2, rate: 3 },
    { lanes: 4, rate: 5 },
  ], 2, new Date('2026-10-14T00:00:00Z'));

  expect(model).toStrictEqual({ kind: 'scale', reason: 'history', current: 2 });
  expect(buildLaneFactor(model, 3)).toBe(1.5);
});

test('it scales by lane count with the no-fit reason when 7 days of reads fit no line', () => {
  const model = buildLaneModel('2026-10-06T00:00:00Z', [
    { lanes: 2, rate: 3 },
    { lanes: 2, rate: 4 },
  ], 2, new Date('2026-10-14T00:00:00Z'));

  expect(model).toStrictEqual({ kind: 'scale', reason: 'no-fit', current: 2 });
});

test('it fits the lane count once the reads span 7 days', () => {
  const model = buildLaneModel('2026-10-06T00:00:00Z', [
    { lanes: 0, rate: 1 },
    { lanes: 2, rate: 3 },
    { lanes: 4, rate: 5 },
  ], 2, new Date('2026-10-14T00:00:00Z'));

  expect(model.kind).toBe('fit');
  expect(buildLaneFactor(model, 4)).toBeCloseTo(5 / 3, 9);
});

test('it keeps the rate whatever the lane count when there are no working lanes to scale from', () => {
  const model = buildLaneModel(null, [], 0, new Date('2026-10-14T00:00:00Z'));

  expect(buildLaneFactor(model, 3)).toBe(1);
});
