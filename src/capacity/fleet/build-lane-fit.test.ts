import { expect, test } from 'bun:test';
import { buildLaneFit } from './build-lane-fit.ts';

test('it fits rate = base + perLane x lanes', () => {
  const fit = buildLaneFit([
    { lanes: 0, rate: 0.5 },
    { lanes: 2, rate: 2.5 },
    { lanes: 4, rate: 4.5 },
  ]);

  expect(fit?.base).toBeCloseTo(0.5, 9);
  expect(fit?.perLane).toBeCloseTo(1, 9);
});

test('it gives no fit when the lane count never changes', () => {
  expect(
    buildLaneFit([
      { lanes: 3, rate: 1 },
      { lanes: 3, rate: 2 },
      { lanes: 3, rate: 3 },
    ]),
  ).toBeNull();
});

test('it gives no fit when the rate falls as lanes rise', () => {
  expect(
    buildLaneFit([
      { lanes: 1, rate: 4 },
      { lanes: 2, rate: 3 },
      { lanes: 3, rate: 2 },
    ]),
  ).toBeNull();
});
