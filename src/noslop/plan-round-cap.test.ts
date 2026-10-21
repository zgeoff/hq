import { expect, test } from 'bun:test';
import { planRoundCap } from './plan-round-cap.ts';

test('it does not know the cap before the first review, which is round 1', () => {
  expect(planRoundCap([])).toStrictEqual({ round: 1, cap: null, reason: 'no review yet' });
});

test.each(['docs-only', 'sync', 'release'])('it caps a PR whose first review was %s at 1 round', (special) => {
  expect(planRoundCap([{ special, depth: 'standard' }])).toStrictEqual({ round: 2, cap: 1, reason: `first review ${special}` });
});

test('it caps a PR whose first review was light at 1 round', () => {
  expect(planRoundCap([{ special: 'none', depth: 'light' }])).toStrictEqual({ round: 2, cap: 1, reason: 'first review light' });
});

test.each(['standard', 'deep'])('it caps a PR whose first review was %s at 2 rounds', (depth) => {
  expect(planRoundCap([{ special: 'none', depth }])).toStrictEqual({ round: 2, cap: 2, reason: `first review ${depth}` });
});

test.each([
  ['light', 1, 'first review light'],
  ['standard', 2, 'first review standard'],
])('it decides a first review at depth %s from before the special was recorded by its depth alone', (depth, cap, reason) => {
  expect(planRoundCap([{ special: null, depth }])).toStrictEqual({ round: 2, cap, reason });
});

test('it caps a PR whose first review has no depth at 2 rounds and says the depth is unknown', () => {
  expect(planRoundCap([{ special: 'none', depth: null }])).toStrictEqual({ round: 2, cap: 2, reason: 'first review depth unknown' });
});

test('it lets the first review decide the cap, whatever the later ones were', () => {
  expect(planRoundCap([{ special: 'none', depth: 'standard' }, { special: 'none', depth: 'light' }])).toStrictEqual({ round: 3, cap: 2, reason: 'first review standard' });
});
