import { expect, test } from 'bun:test';
import { isAsleepOfMergedRun } from './is-asleep-of-merged-run.ts';
import type { AsleepSessionFacts } from './is-asleep-of-merged-run.ts';

test.each<[string, Partial<AsleepSessionFacts>]>([
  ['an asleep session of a working run with every PR merged', {}],
  ['an asleep session of a blocked run with every PR merged', { runState: 'blocked' }],
  ['an asleep session of a run with two merged PRs', { merged: 2 }],
])('it ends %s', (_name, overrides) => {
  expect(isAsleepOfMergedRun({ asleep: true, runState: 'working', scopeHeld: false, merged: 1, open: 0, ageMs: 6 * 60_000, graceMs: 5 * 60_000, ...overrides })).toBe(true);
});

test.each<[string, Partial<AsleepSessionFacts>]>([
  ['an alive session', { asleep: false }],
  ['an asleep session of a run with an open PR left', { open: 1 }],
  ['an asleep session of a run with no merged PR', { merged: 0 }],
  ['an asleep session inside the grace', { ageMs: 5 * 60_000 }],
  ['an asleep session of a run held for open Scope boxes', { scopeHeld: true }],
  ['an asleep session of a merged run', { runState: 'merged' }],
  ['an asleep session of a live-check run', { runState: 'live-check' }],
  ['an asleep session of a done run', { runState: 'done' }],
])('it keeps %s', (_name, overrides) => {
  expect(isAsleepOfMergedRun({ asleep: true, runState: 'working', scopeHeld: false, merged: 1, open: 0, ageMs: 6 * 60_000, graceMs: 5 * 60_000, ...overrides })).toBe(false);
});
