import { expect, test } from 'bun:test';
import { isAsleepOfMergedRun } from './is-asleep-of-merged-run.ts';
import type { AsleepSessionFacts } from './is-asleep-of-merged-run.ts';

const BASE: AsleepSessionFacts = { asleep: true, runState: 'working', merged: 1, open: 0, ageMs: 6 * 60_000, graceMs: 5 * 60_000 };

test.each<[string, Partial<AsleepSessionFacts>, boolean]>([
  ['an asleep session of a working run with every PR merged', {}, true],
  ['the same on a blocked run', { runState: 'blocked' }, true],
  ['the same with two merged PRs', { merged: 2 }, true],
  ['an alive session', { asleep: false }, false],
  ['an open PR left', { open: 1 }, false],
  ['no merged PR', { merged: 0 }, false],
  ['a session inside the grace', { ageMs: 5 * 60_000 }, false],
  ['a merged run', { runState: 'merged' }, false],
  ['a live-check run', { runState: 'live-check' }, false],
  ['a done run', { runState: 'done' }, false],
])('it ends %s: %p', (_name, overrides, expected) => {
  expect(isAsleepOfMergedRun({ ...BASE, ...overrides })).toBe(expected);
});
