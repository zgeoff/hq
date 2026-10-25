import { expect, test } from 'bun:test';
import { buildLaneFactor } from './build-lane-factor.ts';
import { buildLaneModel } from './build-lane-model.ts';

test('it scales linearly by lane count when the reads span under 7 days', () => {
  const model = buildLaneModel('2026-10-10T00:00:00Z', [
    { lanes: 0, rate: 1 },
    { lanes: 2, rate: 3 },
    { lanes: 4, rate: 5 },
  ], new Date('2026-10-14T00:00:00Z'));

  expect(model).toStrictEqual({ kind: 'scale', reason: 'history' });
  expect(buildLaneFactor(model, 2, 3)).toBe(1.5);
});

test('it scales by lane count with the no-fit reason when 7 days of reads fit no line', () => {
  const model = buildLaneModel('2026-10-06T00:00:00Z', [
    { lanes: 2, rate: 3 },
    { lanes: 2, rate: 4 },
  ], new Date('2026-10-14T00:00:00Z'));

  expect(model).toStrictEqual({ kind: 'scale', reason: 'no-fit' });
});

test('it fits the lane count once the reads span 7 days', () => {
  const model = buildLaneModel('2026-10-06T00:00:00Z', [
    { lanes: 0, rate: 1 },
    { lanes: 2, rate: 3 },
    { lanes: 4, rate: 5 },
  ], new Date('2026-10-14T00:00:00Z'));

  expect(model).toStrictEqual({ kind: 'fit', fit: { base: 1, perLane: 1 } });
});

test('it turns 3 points an hour measured at 2 lanes into 5 at 4 lanes on a fit of 1 plus 1 a lane', () => {
  const model = buildLaneModel('2026-10-06T00:00:00Z', [
    { lanes: 0, rate: 1 },
    { lanes: 2, rate: 3 },
    { lanes: 4, rate: 5 },
  ], new Date('2026-10-14T00:00:00Z'));

  expect(3 * buildLaneFactor(model, 2, 4)).toBeCloseTo(5, 9);
});

test('it keeps a measurement taken at 0 working lanes as it is when scaling by lane count', () => {
  const model = buildLaneModel(null, [], new Date('2026-10-14T00:00:00Z'));

  expect(buildLaneFactor(model, 0, 3)).toBe(1);
});
