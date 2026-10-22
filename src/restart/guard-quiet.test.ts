import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { guardQuiet } from './guard-quiet.ts';

// Sydney is UTC+11 in October, so 12:00Z is 23:00 there.
test.each([
  ['23:00 Sydney', '2026-10-14T12:00:00Z'],
  ['03:00 Sydney', '2026-10-14T16:00:00Z'],
  ['07:59 Sydney', '2026-10-14T20:59:00Z'],
])('it refuses an unforced restart at %s', (_time, at) => {
  onTestFinished(overrideEnv('HQ_NOW', at));
  expect(() => guardQuiet(false)).toThrow('no daemon restarts 23:00-08:00 Sydney unless the owner is in chat. Use --force if they are.');
});

test.each([
  ['an unforced restart at 08:00 Sydney', '2026-10-14T21:00:00Z', false],
  ['an unforced restart at 22:59 Sydney', '2026-10-14T11:59:00Z', false],
  ['a forced restart at 03:00 Sydney', '2026-10-14T16:00:00Z', true],
])('it allows %s', (_case, at, force) => {
  onTestFinished(overrideEnv('HQ_NOW', at));
  expect(guardQuiet(force)).toBeUndefined();
});
